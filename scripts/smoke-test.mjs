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

// area 语义（修复点：客户端按列表分区传 area，而非用状态字母猜 staged）
r = await service.diff({ repoPath: tmp, filePath: "a.txt", area: "unstaged" });
check("area=unstaged 返回工作区差异", typeof r === "string" && r.includes("line2 modified"), r.slice(0, 60));
r = await service.diff({ repoPath: tmp, filePath: "a.txt", area: "staged" });
check("area=staged 对未暂存文件为空", r === "", JSON.stringify(r.slice(0, 40)));
execSync("git add a.txt", { cwd: tmp });
r = await service.diff({ repoPath: tmp, filePath: "a.txt", area: "staged" });
check("area=staged 返回已暂存差异", typeof r === "string" && r.includes("line2 modified"), r.slice(0, 60));
r = await service.diff({ repoPath: tmp, filePath: "a.txt", area: "unstaged" });
check("area=unstaged 对已暂存文件为空", r === "", JSON.stringify(r.slice(0, 40)));
execSync("git reset -q -- a.txt", { cwd: tmp });

// 同一文件同时存在已暂存与未暂存改动（AM）：两个分区各取各的，不得串内容
writeFileSync(join(tmp, "c.txt"), "c1\n");
execSync("git add c.txt", { cwd: tmp });
writeFileSync(join(tmp, "c.txt"), "c1\nc2\n");
r = await service.diff({ repoPath: tmp, filePath: "c.txt", area: "staged" });
check("AM 文件 staged 只含已暂存块", typeof r === "string" && r.includes("+c1") && !r.includes("+c2"), r.slice(0, 70));
r = await service.diff({ repoPath: tmp, filePath: "c.txt", area: "unstaged" });
check("AM 文件 unstaged 只含未暂存块", typeof r === "string" && r.includes("+c2") && !r.includes("+c1"), r.slice(0, 70));
execSync("git reset -q -- c.txt", { cwd: tmp });

// 未跟踪文件：git diff 本身不输出内容，需服务端合成"整文件新增"
r = await service.diff({ repoPath: tmp, filePath: "b.txt", area: "untracked" });
check("area=untracked 返回整文件新增差异", typeof r === "string" && r.includes("+new file") && r.includes("@@"), r.slice(0, 90));
r = await service.diff({ repoPath: tmp, filePath: "b.txt", area: "unstaged" });
check("未跟踪文件按 unstaged 取为空（保证分区不串）", r === "", JSON.stringify(r.slice(0, 40)));
// 二进制 / 超大 / 空文件 → 友好提示
writeFileSync(join(tmp, "bin.dat"), Buffer.from([0, 1, 2, 3, 0, 255, 10]));
r = await service.diff({ repoPath: tmp, filePath: "bin.dat", area: "untracked" });
check("未跟踪二进制文件给出提示", typeof r === "string" && r.includes("二进制"), r);
writeFileSync(join(tmp, "big.txt"), "x".repeat(1024 * 1024 + 1));
r = await service.diff({ repoPath: tmp, filePath: "big.txt", area: "untracked" });
check("超大未跟踪文件给出提示", typeof r === "string" && r.includes("过大"), r);
writeFileSync(join(tmp, "empty.txt"), "");
r = await service.diff({ repoPath: tmp, filePath: "empty.txt", area: "untracked" });
check("空未跟踪文件给出提示", typeof r === "string" && r.includes("空文件"), r);
rmSync(join(tmp, "big.txt"), { force: true });

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
