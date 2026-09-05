/**
 * @module dsh-git
 * Git 版本控制插件 — 主机端服务
 *
 * 通过 child_process 执行 Git 命令，并以宿主 webServer 上的一条 JSON-over-HTTP
 * 路由（POST /dsh-git/api）暴露给浏览器端。不依赖任何 @deepseek-ai 运行时包，
 * 仅使用 Node 内置模块与宿主提供的 cordis ctx（webServer/connection 可选注入）。
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── 常量 ───────────────────────────────────────────────────────────

/** 插件名称，须与 cordis.patch.yml 中的 insert id 一致 */
export const name = "dsh-git";

/** JSON API 路由（宿主 webServer 精确路径） */
export const API_PATH = "/dsh-git/api";

/** 宿主端可调用的方法白名单 */
const API_METHODS = new Set([
  "scanRepositories",
  "rescanRepositories",
  "addRepository",
  "status",
  "log",
  "parsedLog",
  "diff",
  "commit",
  "branches",
  "currentBranch",
  "isRepo",
  "checkout",
  "createBranch",
  "pull",
  "push",
  "merge",
  "deleteBranch",
  "aiCommitMessage",
]);

// ─── AI 提交信息：常量与内置默认规则 ───────────────────────────────

/** 生成提交信息的最大输出 token */
const AI_MAX_TOKENS = 4096;
/** 单次生成超时 */
const AI_TIMEOUT_MS = 60000;
/** 送入模型的差异文本总预算（字符） */
const AI_INPUT_MAX_CHARS = 32000;
/** 单文件差异/预览预算（字符） */
const AI_PER_FILE_MAX_CHARS = 8000;
/** 规则文件读取上限 */
const AI_RULES_FILE_MAX_BYTES = 64 * 1024;
/** 规则文件相对位置（工作区/全局均为该固定文件名约定） */
const AI_RULES_SUBPATH = join(".dsh", "rules", "git-commit-rules.md");
/** 无规则文件时的内置默认（Conventional Commits） */
const AI_BUILTIN_RULES = [
  "Commit message 必须遵循 Conventional Commits 规范：",
  "- 格式：<type>(<scope>): <subject>",
  "- type 取：feat / fix / docs / refactor / test / chore / perf / style / build / ci / revert；破坏性变更用 feat!/fix! 并加 body 的 BREAKING CHANGE:",
  "- subject 首行不超过 72 字符、祈使句、小写开头、结尾不带句号",
  "- 内容较复杂时用空行分隔 body，逐条说明动机与影响（每条一行，可用 - 列表）",
  "- 不写与本次变更无关的内容，不捏造细节",
].join("\n");

/** 读取单个规则文件（大小受限），读失败返回 undefined */
function readRulesFile(path) {
  try {
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, "utf-8");
    return raw.length > AI_RULES_FILE_MAX_BYTES ? raw.slice(0, AI_RULES_FILE_MAX_BYTES) : raw;
  } catch {
    return undefined;
  }
}

/** DSH 全局目录：$DSH_HOME（本身即 .dsh）→ ~/.dsh */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
/** 全局规则相对位（相对 DSH_HOME）：rules/git-commit-rules.md */
const AI_RULES_GLOBAL_REL = join("rules", "git-commit-rules.md");

/**
 * 就近解析提交信息规则：
 * ① workspace/.dsh/rules/git-commit-rules.md  ② ~/.dsh/rules/git-commit-rules.md
 * ③ 内置默认（Conventional Commits）。返回 { text, source }。
 */
function resolveAiRules(workspaceRoot) {
  if (typeof workspaceRoot === "string" && workspaceRoot !== "") {
    const workspaceFile = readRulesFile(join(workspaceRoot, AI_RULES_SUBPATH));
    if (workspaceFile !== undefined) return { text: workspaceFile, source: "workspace" };
  }
  const globalFile = readRulesFile(join(dshHome(), AI_RULES_GLOBAL_REL));
  if (globalFile !== undefined) return { text: globalFile, source: "global" };
  return { text: AI_BUILTIN_RULES, source: "builtin" };
}

/**
 * 收集待提交差异载荷（按文件，含整体/单文件预算截断）。
 * 返回 { sections: [{path, text}], truncated: string[] }
 */
function buildDiffPayload(repoPath, included) {
  const paths = [...new Set((Array.isArray(included) ? included : []).filter((p) => typeof p === "string" && p !== ""))];
  const sections = [];
  const truncatedNotes = [];

  if (paths.length === 0) return { sections, truncatedNotes };

  // 未跟踪集合（用于区分：未跟踪文件无 HEAD 版本，走内容预览）
  let untracked = new Set();
  const ls = safeGit(repoPath, "ls-files --others --exclude-standard");
  if (ls.ok) untracked = new Set(ls.value.split("\n").filter(Boolean));
  const tracked = paths.filter((p) => !untracked.has(p));

  const budget = AI_INPUT_MAX_CHARS;
  let used = 0;
  const push = (path, text) => {
    const t = typeof text === "string" ? text : "";
    if (used >= budget) { truncatedNotes.push(path); return; }
    const remaining = budget - used;
    let chunk = t;
    if (t.length > remaining) {
      chunk = t.slice(0, Math.max(0, remaining));
      truncatedNotes.push(path);
    }
    sections.push({ path, text: chunk });
    used += chunk.length;
  };

  // 1) 已跟踪文件：一次 git diff HEAD 拿到 staged+unstaged 的并集（将入 index 的内容）
  if (tracked.length > 0) {
    const quoted = tracked.map((p) => `"${p}"`).join(" ");
    const diffOut = safeGit(repoPath, `diff HEAD -- ${quoted}`);
    if (diffOut.ok && diffOut.value) {
      // 按 diff --git 切分为逐文件块，便于逐文件截断与排序
      const blocks = diffOut.value.split(/\n(?=diff --git )/);
      for (const block of blocks) {
        const m = block.match(/^diff --git a\/(.*?) b\//);
        const path = m ? m[1] : tracked[0];
        push(path, block.length > AI_PER_FILE_MAX_CHARS ? block.slice(0, AI_PER_FILE_MAX_CHARS) + `\n…(单文件 ${path} 超长已截断)` : block);
      }
    } else {
      truncatedNotes.push(...tracked);
    }
  }

  // 2) 未跟踪文件：内容预览
  for (const p of paths) {
    if (!untracked.has(p)) continue;
    try {
      const raw = readFileSync(join(repoPath, p), "utf-8");
      const t = raw.length > AI_PER_FILE_MAX_CHARS ? raw.slice(0, AI_PER_FILE_MAX_CHARS) + `\n…(文件超长已截断)` : raw;
      push(p, `(new file, content preview)\n${t}`);
    } catch {
      truncatedNotes.push(p);
    }
  }

  return { sections, truncatedNotes };
}

/** 组装 LLM 请求：system（含规则）+ 单条 user（差异载荷） */
function buildAiRequest({ provider, model, rules, payload, workspaceRoot }) {
  const head = [
    "你是一名资深 Git 提交信息助手。根据下方“待提交变更”的差异内容，生成一条符合规则的 Git 提交信息。",
    `规则来源：${rules.source}${rules.source === "workspace" ? `（${join(workspaceRoot || "", AI_RULES_SUBPATH)}）` : ""}`,
    "",
    "=== 规则 ===",
    rules.text,
    "",
    "=== 输出要求 ===",
    "- 只输出提交信息本体，不要任何解释、标题、Markdown 代码块或前后缀",
    "- 首行是 subject；需要时可空一行接 body",
  ].join("\n");
  const fileLines = payload.sections.map((s) => `### FILE: ${s.path}\n${s.text}`).join("\n\n");
  const tail = payload.truncatedNotes.length > 0
    ? `\n\n（以下变更超出输入预算未提供：${payload.truncatedNotes.join("、")}）`
    : "";
  const userText = `待提交变更（${payload.sections.length} 个文件）：\n\n${fileLines}${tail}`;
  return {
    messages: [{
      id: `dsh-git-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      role: "user",
      content: [{ type: "text", text: userText }],
      source: { kind: "user" },
    }],
    system: head,
  };
}

/**
 * 消费 LLM 流并拼接文本块。
 * llm 为鸭子类型的 stream(options) 可迭代对象（兼容 ctx.llm / 测试替身）。
 */
async function runAiStream(llm, request, signal) {
  const stream = llm.stream({
    ...request,
    temperature: 0.2,
    maxTokens: AI_MAX_TOKENS,
    signal,
  });
  let out = "";
  const seen = [];
  let finishReason;
  for await (const chunk of stream) {
    if (signal?.aborted) throw new Error("AI 生成已取消");
    seen.push(chunk?.type);
    if (chunk?.type === "text-delta") out += chunk.text;
    else if (chunk?.type === "error") throw new Error(chunk.error?.message || "LLM 生成出错");
    else if (chunk?.type === "finish") { finishReason = chunk.reason?.kind ?? JSON.stringify(chunk.reason ?? null); break; }
  }
  const text = out.trim();
  if (!text) throw new Error(`LLM 无文本输出（chunks: ${seen.slice(0, 20).join(",")}; finish: ${finishReason}）`);
  return text;
}

// ─── 工具函数 ───────────────────────────────────────────────────────

/**
 * 在指定目录下安全执行 Git 命令
 * @param {string} cwd - 工作目录
 * @param {string} cmd - Git 子命令（不含 "git" 前缀）
 * @returns {string} 命令输出
 */
function git(cwd, cmd) {
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      // 仅去掉尾部换行，保留前导空白（porcelain 的 XY 状态码依赖列对齐）
    }).trimEnd();
  } catch (err) {
    const text = (err.stderr || err.stdout || "").toString().trim();
    throw new Error(text || `git ${cmd} failed`);
  }
}

/**
 * 安全执行 Git 命令（不抛出异常）
 * @param {string} cwd - 工作目录
 * @param {string} cmd - Git 子命令
 * @returns {{ ok: boolean, value?: string, error?: string }}
 */
function safeGit(cwd, cmd) {
  try {
    const output = git(cwd, cmd);
    return { ok: true, value: output };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 扫描目录下的 Git 仓库（深度 0 + 深度 1）
 * @param {string} rootPath - 根目录
 * @returns {string[]} 仓库绝对路径列表
 */
function scanGitRepos(rootPath) {
  const repos = [];

  if (existsSync(join(rootPath, ".git"))) {
    repos.push(rootPath);
  }

  try {
    const entries = execSync(`ls -1A "${rootPath}"`, {
      encoding: "utf-8",
      timeout: 5000,
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    for (const entry of entries) {
      const subPath = join(rootPath, entry);
      if (existsSync(join(subPath, ".git"))) {
        repos.push(subPath);
      }
    }
  } catch {
    // 忽略扫描错误
  }

  return repos;
}

/**
 * 读取或初始化 Git 仓库配置文件
 * @param {string} dshDir - .dsh 目录路径
 * @returns {{ last_scan: string, repositories: string[] } | null}
 */
function loadGitReposConfig(dshDir) {
  const configPath = join(dshDir, "git_repos.json");
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      // 文件损坏，重新扫描
    }
  }
  return null;
}

/**
 * 保存 Git 仓库配置文件
 * @param {string} dshDir - .dsh 目录路径
 * @param {{ last_scan: string, repositories: string[] }} config
 */
function saveGitReposConfig(dshDir, config) {
  if (!existsSync(dshDir)) {
    mkdirSync(dshDir, { recursive: true });
  }
  writeFileSync(join(dshDir, "git_repos.json"), JSON.stringify(config, null, 2), "utf-8");
}

/** 从宿主上下文尽力取工作区根目录（客户端未显式传 workspacePath 时使用） */
function bestEffortWorkspaceRoot(hostCtx) {
  try {
    const policy = hostCtx.get("sandboxPolicy");
    const resolve = policy?.resolve;
    if (typeof resolve !== "function") return undefined;
    const result = resolve({});
    if (result === null || typeof result !== "object") return undefined;
    const root = result.workspaceRoot;
    return typeof root === "string" && root !== "" ? root : undefined;
  } catch {
    return undefined;
  }
}

/** Loopback-Origin 围栏：拒绝跨站浏览器来源（无 Origin 的非浏览器客户端放行） */
function originRejection(request) {
  const header = request.headers.origin;
  if (header === undefined || header === "null") return undefined;
  try {
    const { hostname } = new URL(header);
    if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") return undefined;
  } catch {
    /* 解析失败即拒绝 */
  }
  return `origin ${JSON.stringify(header)} is not loopback`;
}

// ─── Git 服务（纯逻辑，无框架依赖）─────────────────────────────────

class GitService {
  /** 工作区根回退：仅当客户端没能解析出"当前选中工作区"时才使用 */
  defaultRoot;
  /** 宿主上下文（webServer fiber 的 hostCtx），用于运行时取 llm/sessionController 等服务 */
  host;

  /** @param {{ defaultRoot?: string, host?: import("@deepseek-ai/cordis").Context }} [options] */
  constructor(options = {}) {
    this.defaultRoot = options.defaultRoot || process.cwd();
    this.host = options.host;
  }

  /**
   * 本次扫描的唯一根：显式 workspacePath（客户端传来的当前选中工作区）
   * 优先；缺失时退到 defaultRoot —— 绝不枚举其它工作区/全盘目录。
   */
  resolveRoot(workspacePath) {
    const candidate = workspacePath || this.defaultRoot;
    try {
      const real = realpathSync(candidate);
      return existsSync(real) ? real : undefined;
    } catch {
      return undefined;
    }
  }

  /** 扫描单个根目录（深度 0 + 深度 1） */
  scanRoot(rootPath) {
    return scanGitRepos(rootPath);
  }

  /** 读取某根目录的缓存配置 */
  cachedConfig(rootPath) {
    return loadGitReposConfig(join(rootPath, ".dsh"));
  }

  /** 写某根目录的缓存配置 */
  persistConfig(rootPath, repos) {
    const config = { last_scan: new Date().toISOString(), repositories: repos };
    saveGitReposConfig(join(rootPath, ".dsh"), config);
    return config;
  }

  /**
   * 扫描 Git 仓库 —— 仅针对"当前选中的工作区"这一个根目录：
   * - 显式 workspacePath：命中缓存则直接返回（首次打开读缓存语义）；
   * - 未传（客户端解析失败）：回退 defaultRoot，新鲜扫描、不写缓存。
   */
  async scanRepositories(request) {
    const root = this.resolveRoot(request.workspacePath);
    if (!root) return { last_scan: new Date().toISOString(), repositories: [] };
    if (request.workspacePath) {
      const cached = this.cachedConfig(root);
      if (cached) return cached;
      return this.persistConfig(root, this.scanRoot(root));
    }
    return { last_scan: new Date().toISOString(), repositories: this.scanRoot(root) };
  }

  async rescanRepositories(request) {
    const root = this.resolveRoot(request.workspacePath);
    if (!root) return { last_scan: new Date().toISOString(), repositories: [] };
    if (request.workspacePath) return this.persistConfig(root, this.scanRoot(root));
    return { last_scan: new Date().toISOString(), repositories: this.scanRoot(root) };
  }

  async addRepository(request) {
    // 手动添加：写入"当前工作区"（或 defaultRoot）的 .dsh 配置
    const root = this.resolveRoot(request.workspacePath);
    if (!root) return { last_scan: new Date().toISOString(), repositories: [] };
    const dshDir = join(root, ".dsh");
    const config = loadGitReposConfig(dshDir) || {
      last_scan: new Date().toISOString(), repositories: [],
    };
    if (request.repoPath && !config.repositories.includes(request.repoPath)) {
      config.repositories.push(request.repoPath);
      config.last_scan = new Date().toISOString();
      saveGitReposConfig(dshDir, config);
    }
    return config;
  }

  async status(request) {
    const { repoPath } = request;
    const result = safeGit(repoPath, "status --porcelain");
    if (!result.ok) throw new Error(result.error);

    const staged = [], unstaged = [], untracked = [];
    const lines = result.value.split("\n").filter(Boolean);

    for (const line of lines) {
      const xy = line.substring(0, 2);
      const path = line.substring(3).trim();
      const filePath = path.includes(" -> ") ? path.split(" -> ").pop() : path;
      const x = xy[0], y = xy[1];

      if (xy === "??") {
        untracked.push(filePath);
      } else {
        if (x !== " " && x !== "?") staged.push({ path: filePath, status: x });
        if (y !== " " && y !== "?") unstaged.push({ path: filePath, status: y });
      }
    }
    return { staged, unstaged, untracked };
  }

  /**
   * 计算 log 的 ref 参数：
   * - 未传 / 空 / "ALL" → 所有分支（--all）
   * - 否则校验为合法分支名后使用（防注入），非法则回退 --all
   */
  refArg(branch) {
    if (typeof branch !== "string" || branch === "" || branch === "ALL") return "--all";
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.startsWith("-")) return "--all";
    return branch;
  }

  /**
   * 获取 Git 提交日志（原始 graph 文本，供可视化展示）
   */
  async log(request) {
    const { repoPath, maxCount = 50 } = request;
    const result = safeGit(
      repoPath,
      `log ${this.refArg(request.branch)} --graph --max-count=${maxCount} --pretty=format:"%h %d %s [%an]"`
    );
    return result.ok ? result.value : "";
  }

  /**
   * 解析 Git 提交为结构化数据（含 graph 拓扑前缀）。
   *
   * `--graph` 会在每一行（包括分隔行与数据行）前插入图形字符，且不同提交
   * 的数据行互相交错，无法从单次输出可靠解析出逐字段数据。因此执行两次 log：
   *   1) `--graph --pretty=format:%H` —— 每个提交恰好一行，取图前缀与 hash；
   *   2) 无 graph 的结构化输出 —— git log 以换行分隔记录、记录内以 NUL 分隔
   *      字段，先按 \n 切记录再按 \0 切字段，最后按 hash 对齐合并。
   * 可选 request.branch：指定单个分支（缺省/ALL = 所有分支）。
   */
  async parsedLog(request) {
    const { repoPath, maxCount = 50 } = request;
    const ref = this.refArg(request.branch);

    const graph = safeGit(repoPath, `log ${ref} --graph --max-count=${maxCount} --pretty=format:%H`);
    if (!graph.ok || !graph.value) return [];

    const sep = "%x00";
    const format = `%H${sep}%h${sep}%an${sep}%ae${sep}%ai${sep}%s${sep}%d${sep}%P`;
    const meta = safeGit(repoPath, `log ${ref} --max-count=${maxCount} --pretty=format:"${format}"`);
    const byHash = new Map();
    if (meta.ok && meta.value) {
      for (const record of meta.value.split("\n")) {
        const [hash, shortHash, author, email, date, message, refs, parents] = record.split("\0");
        if (!hash) continue;
        byHash.set(hash, { hash, shortHash, author, email, date, message, refs, parents: parents ? parents.split(" ") : [] });
      }
    }

    const commits = [];
    for (const row of graph.value.split("\n")) {
      const hash = row.match(/[0-9a-f]{40}\s*$/)?.[0]?.trim();
      if (!hash) continue;
      const commit = byHash.get(hash);
      if (!commit) continue;
      commits.push({ ...commit, graphLine: row.slice(0, row.length - hash.length).replace(/\s+$/, "") });
    }
    return commits;
  }

  async diff(request) {
    const { repoPath, filePath, staged = false } = request;
    const cached = staged ? "--cached " : "";
    const result = safeGit(repoPath, `diff ${cached}-- "${filePath}"`);
    return result.ok ? result.value : "";
  }

  /**
   * 提交变更。
   * 支持三种模式（互斥优先）：
   * - all === true        ：git add -A 全量后提交（默认/兼容旧调用）；
   * - stage/unstage 数组   ：选择性提交 —— stage 是本次要 add 的路径（未暂存/未跟踪），
   *                          unstage 是要从 index 取消暂存的路径（已暂存但未勾选），
   *                          精确保证"勾了什么才提交什么"。
   */
  async commit(request) {
    const { repoPath, message, files, all = true } = request;
    const stage = Array.isArray(request.stage) ? request.stage : [];
    const unstage = Array.isArray(request.unstage) ? request.unstage : [];

    if (all) {
      const addResult = safeGit(repoPath, "add -A");
      if (!addResult.ok) return { ok: false, error: addResult.error };
    } else {
      // 先取消未勾选文件的暂存（保留工作区改动），再 add 勾选的新增/修改/删除
      for (const file of unstage) {
        const resetResult = safeGit(repoPath, `reset -q -- "${file}"`);
        if (!resetResult.ok) return { ok: false, error: `Failed to unstage ${file}: ${resetResult.error}` };
      }
      for (const file of stage) {
        const addResult = safeGit(repoPath, `add -- "${file}"`);
        if (!addResult.ok) return { ok: false, error: `Failed to add ${file}: ${addResult.error}` };
      }
    }

    const commitResult = safeGit(repoPath, `commit -m "${message.replace(/"/g, '\\"')}"`);
    return commitResult.ok
      ? { ok: true, output: commitResult.value }
      : { ok: false, error: commitResult.error };
  }

  async branches(request) {
    const { repoPath } = request;
    const result = safeGit(repoPath, "branch");
    if (!result.ok) return { current: "", branches: [] };

    const lines = result.value.split("\n").filter(Boolean);
    const branches = lines.map((l) => l.replace(/^\*?\s*/, "").trim());
    const current = lines.find((l) => l.startsWith("*"))?.replace(/^\*\s*/, "").trim() || "";
    return { current, branches };
  }

  async currentBranch(request) {
    const { repoPath } = request;
    // symbolic-ref 在新仓库（尚无提交）时也能返回当前分支名
    const symbolic = safeGit(repoPath, "symbolic-ref --short -q HEAD");
    if (symbolic.ok && symbolic.value) return symbolic.value;
    // detached HEAD：退回 rev-parse
    const result = safeGit(repoPath, "rev-parse --abbrev-ref HEAD");
    if (result.ok && result.value && result.value !== "HEAD") return result.value;
    return "";
  }

  async isRepo(request) {
    const { repoPath } = request;
    return existsSync(join(repoPath, ".git"));
  }

  /** 分支名校验（新建/切换共用）；非法返回 undefined */
  validBranchName(name) {
    if (typeof name !== "string" || name === "" || name === "ALL") return undefined;
    if (name.startsWith("-") || name.includes("..") || name.includes("@{") || /\s/.test(name)) return undefined;
    if (!/^[A-Za-z0-9._/-]+$/.test(name)) return undefined;
    return name;
  }

  /**
   * 切换到已有分支（git checkout）。脏工作区/冲突由 git 原生报错回显。
   */
  async checkout(request) {
    const { repoPath } = request;
    const branch = this.validBranchName(request.branch);
    if (branch === undefined) return { ok: false, error: `invalid branch name ${JSON.stringify(request.branch)}` };
    const result = safeGit(repoPath, `switch "${branch}" 2>&1`);
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 新建分支并切换：默认基于当前 HEAD；可选 startPoint 指定基于某个已有
   * 分支/引用创建（git switch -c <name> [<startPoint>]）。
   */
  async createBranch(request) {
    const { repoPath } = request;
    const branch = this.validBranchName(request.branch);
    if (branch === undefined) return { ok: false, error: `invalid branch name ${JSON.stringify(request.branch)}` };
    let startRef;
    if (request.startPoint !== undefined && request.startPoint !== "") {
      startRef = this.validBranchName(request.startPoint);
      if (startRef === undefined) return { ok: false, error: `invalid start point ${JSON.stringify(request.startPoint)}` };
    }
    const cmd = startRef === undefined
      ? `switch -c "${branch}" 2>&1`
      : `switch -c "${branch}" "${startRef}" 2>&1`;
    const result = safeGit(repoPath, cmd);
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 拉取当前分支并合并上游（git pull）。需要已配置 upstream；凭据缺失/
   * 网络错误由 git 原生报错回显。
   */
  async pull(request) {
    const { repoPath } = request;
    const result = safeGit(repoPath, "pull 2>&1");
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 推送当前分支到其上游（git push）。
   */
  async push(request) {
    const { repoPath } = request;
    const result = safeGit(repoPath, "push 2>&1");
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 把指定分支合并进当前分支（git merge <branch>）。
   * 冲突时 git 返回非零并把冲突说明带入错误信息，UI 需提示用户处理。
   */
  async merge(request) {
    const { repoPath } = request;
    const branch = this.validBranchName(request.branch);
    if (branch === undefined) return { ok: false, error: `invalid branch name ${JSON.stringify(request.branch)}` };
    const result = safeGit(repoPath, `merge "${branch}" 2>&1`);
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 删除本地分支：默认 -d（仅允许已合并）；传入 force:true 时 -D 强制删除。
   */
  async deleteBranch(request) {
    const { repoPath, force = false } = request;
    const branch = this.validBranchName(request.branch);
    if (branch === undefined) return { ok: false, error: `invalid branch name ${JSON.stringify(request.branch)}` };
    const result = safeGit(repoPath, `branch ${force ? "-D" : "-d"} "${branch}" 2>&1`);
    return result.ok
      ? { ok: true, output: result.value }
      : { ok: false, error: result.error };
  }

  /**
   * 依据当前勾选变更（included）生成提交信息。
   * 流程：就近规则 → 收集差异载荷（预算截断）→ 部署默认模型 → llm.stream。
   * 测试注入：params.provider/model 直接覆盖模型选择。
   */
  async aiCommitMessage(request) {
    const { repoPath } = request;
    const llm = this.host?.get?.("llm");
    if (!llm) return { ok: false, error: "宿主未提供 LLM 服务，AI 生成不可用（仍可手动填写提交信息）" };

    // 规则目录：按“当前选中工作区”解析；缺失时以仓库根为规则根
    const workspaceRoot = this.resolveRoot(request.workspacePath) || this.resolveRoot(repoPath);
    const rules = resolveAiRules(workspaceRoot);

    const payload = buildDiffPayload(repoPath, request.included);
    if (payload.sections.length === 0) {
      return { ok: false, error: "没有可生成提交信息的变更（请先勾选要提交的文件）" };
    }

    // 模型路由：显式覆盖 > 会话/部署默认（sessionController.modelCatalog）> 兜底
    let provider = request.provider;
    let model = request.model;
    if (!provider || !model) {
      try {
        const catalog = await this.host.get("sessionController")?.modelCatalog?.();
        const d = catalog?.default;
        if (d?.provider && !provider) provider = d.provider;
        if (d?.model && !model) model = d.model;
      } catch { /* 目录不可用则走兜底 */ }
    }
    provider = provider || process.env.LLM_API_PROVIDER || "deepseek";
    model = model || process.env.LLM_API_MODEL || "deepseek-chat";

    const requestBody = buildAiRequest({ provider, model, rules, payload, workspaceRoot });
    const attempt = async (p, m, isRetry) => {
      const body = buildAiRequest({ provider: p, model: m, rules, payload, workspaceRoot });
      try {
        const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(AI_TIMEOUT_MS)
          : undefined;
        const message = await runAiStream(llm, { provider: p, model: m, ...body }, signal);
        return { ok: true, message, usedRetry: isRetry };
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        const mapped = /AUTH|401|api key|API Key/i.test(text) ? "模型调用缺少有效凭据（请检查 DSH 模型配置/API Key）"
          : /RATE_LIMIT|429|限流/i.test(text) ? "模型限流，请稍后重试"
          : /NO_ADAPTER|没有可用的.*adapter/i.test(text) ? "当前未配置可用的模型服务"
          : text;
        return { ok: false, error: mapped, emptyText: /无文本输出|未返回提交信息/.test(text) };
      }
    };
    const first = await attempt(provider, model, false);
    if (first.ok) return first.ok === true ? { ok: true, message: first.message } : first;
    // 推理型默认模型把预算耗在 thinking 上导致无文本 → 降级重试官方非思考模型
    if (first.emptyText && provider === "deepseek" && model !== "deepseek-chat") {
      const retry = await attempt(provider, "deepseek-chat", true);
      if (retry.ok) return { ok: true, message: retry.message };
    }
    return {
      ok: false,
      error: first.emptyText
        ? "AI 生成失败：模型未返回文本输出，请重试"
        : `AI 生成失败：${first.error}`,
    };
  }

  /** HTTP 路由分发：method 白名单 + JSON 响应封装 */
  async dispatch(method, params) {
    if (!API_METHODS.has(method)) {
      return { ok: false, error: `unknown dsh-git method ${JSON.stringify(method)}` };
    }
    const value = await this[method](params || {});
    // 业务型方法（commit/checkout/createBranch）自带 { ok, output|error } → 直接透传
    if (value !== null && typeof value === "object" && typeof value.ok === "boolean") return value;
    return { ok: true, value };
  }
}

// ─── HTTP JSON API（宿主 webServer 路由）────────────────────────────

/**
 * 读取并解析请求体为 JSON 对象
 * @returns {Promise<any>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/**
 * 注册 JSON API 路由到宿主 webServer。
 * 仅在存在 webServer 的宿主上生效（scoped inject），其余场景安全跳过。
 * @param {import("@deepseek-ai/cordis").Context} ctx - 宿主根上下文
 */
function registerApi(ctx) {
  // 宿主连接围栏（尽力取用，须绑定实例调用）；webServer 纤维启动早于其赋值时仅用自身 Origin 围栏
  let requestRejection = undefined;
  ctx.inject(["connection"], (connCtx) => {
    const connection = connCtx.connection;
    const rejection = connection?.requestRejection;
    if (connection !== undefined && typeof rejection === "function") {
      const bound = rejection.bind(connection);
      requestRejection = (request) => bound(request);
      return () => { requestRejection = undefined; };
    }
    return () => {};
  });

  ctx.inject(["webServer"], (hostCtx) => {
    const webServer = hostCtx.webServer;
    if (webServer === undefined) return () => {};

    // 回退根（客户端解析不到"当前选中工作区"时使用）：sandboxPolicy → cwd。
    // 绝不枚举其它注册工作区 —— 扫描只针对当前选中的一个工作区。
    const service = new GitService({
      defaultRoot: bestEffortWorkspaceRoot(hostCtx) ?? process.cwd(),
      host: hostCtx,
    });

    const dispose = webServer.register({
      kind: "exact",
      path: API_PATH,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        // 围栏：宿主策略优先，自己的 loopback-Origin 兜底
        const fence = requestRejection?.(req) ?? originRejection(req);
        if (fence !== undefined) {
          sendJson(res, 403, { ok: false, error: fence });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const { method, params } = body ?? {};
          if (typeof method !== "string") {
            sendJson(res, 400, { ok: false, error: "missing method" });
            return;
          }
          const result = await service.dispatch(method, params);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    });

    return () => {
      requestRejection = undefined;
      dispose();
    };
  });
}

/** 宿主插件启动入口 */
const inject = [];

function apply(ctx) {
  registerApi(ctx);
}

export {
  GitService,
  API_METHODS,
  apply,
  inject,
  resolveAiRules,
  buildDiffPayload,
  buildAiRequest,
  runAiStream,
  AI_BUILTIN_RULES,
};
export default apply;