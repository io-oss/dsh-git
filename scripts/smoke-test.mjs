/**
 * dsh-git 插件功能冒烟测试
 * 1) 在 /tmp 创建临时 git 仓库，测试 status / log / diff / commit / branches 全链路
 * 2) 对当前工作区做只读测试（isRepo / status / parsedLog / currentBranch）
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { GitService } from "/home/liu-yong/仓库/代码/private/dsh-git/lib/index.js";

// ── 构造最小运行环境（纯逻辑，无框架依赖）──
const service = new GitService({ defaultRoot: "/tmp" });
console.log("✔ GitService 实例化成功");

let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✔ ${label}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✘ ${label}${detail ? " — " + detail : ""}`); }
}

// ── 1) 临时仓库全链路测试 ──
const tmp = "/tmp/dsh-git-smoke-" + Date.now();
mkdirSync(tmp, { recursive: true });
execSync("git init -q -b main", { cwd: tmp });
execSync("git config user.email test@example.com && git config user.name Tester", { cwd: tmp });

writeFileSync(join(tmp, "a.txt"), "line1\nline2\n");
execSync("git add a.txt && git commit -q -m 'first commit'", { cwd: tmp });
writeFileSync(join(tmp, "a.txt"), "line1\nline2 modified\n");
writeFileSync(join(tmp, "b.txt"), "new file\n");

console.log("\n── 临时仓库全链路 ──");

let r = await service.isRepo({ repoPath: tmp });
check("isRepo", r === true);

r = await service.branches({ repoPath: tmp });
check("branches", r.current === "main" && r.branches.length === 1, JSON.stringify(r));

r = await service.currentBranch({ repoPath: tmp });
check("currentBranch", r === "main", r);

r = await service.status({ repoPath: tmp });
check("status 检测未暂存修改", r.unstaged.some(f => f.path === "a.txt" && f.status === "M"), JSON.stringify(r.unstaged));
check("status 检测未跟踪文件", r.untracked.includes("b.txt"), JSON.stringify(r.untracked));

r = await service.diff({ repoPath: tmp, filePath: "a.txt", staged: false });
check("diff 返回差异文本", typeof r === "string" && r.includes("line2 modified"), r.slice(0, 80));

r = await service.parsedLog({ repoPath: tmp, maxCount: 10 });
check("parsedLog 返回结构化提交", Array.isArray(r) && r.length === 1, JSON.stringify(r[0] && { shortHash: r[0].shortHash, message: r[0].message, author: r[0].author }));

r = await service.log({ repoPath: tmp, maxCount: 10 });
check("log 返回原始 graph 输出", typeof r === "string" && r.includes("first commit"), r.split("\n")[0]);

// commit 测试
r = await service.commit({ repoPath: tmp, message: "test commit", all: true });
check("commit 成功", r.ok === true, r.output || r.error);

r = await service.status({ repoPath: tmp });
check("commit 后工作区干净", r.staged.length === 0 && r.unstaged.length === 0 && r.untracked.length === 0);

// 空目录 isRepo=false
const emptyDir = join(tmp, "empty"); mkdirSync(emptyDir);
r = await service.isRepo({ repoPath: emptyDir });
check("isRepo 对非仓库返回 false", r === false);

// ── 2) 当前工作区只读测试 ──
const ws = "/home/liu-yong/仓库/代码/private/dsh-git";
console.log("\n── 当前工作区只读 ──");
r = await service.isRepo({ repoPath: ws });
check("工作区是 git 仓库", r === true);

r = await service.currentBranch({ repoPath: ws });
check("读取当前分支", typeof r === "string" && r.length > 0, r);

r = await service.status({ repoPath: ws });
check("读取工作区 status", Array.isArray(r.untracked), "untracked=" + r.untracked.length);

r = await service.parsedLog({ repoPath: ws, maxCount: 5 });
check("读取工作区提交历史", Array.isArray(r), "commits=" + r.length);

// ── 清理 ──
rmSync(tmp, { recursive: true, force: true });

console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
