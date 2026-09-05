/**
 * AI 提交信息宿主逻辑冒烟测试：
 * 1) 规则就近解析（工作区 > 全局 > 内置）；
 * 2) 差异载荷收集（已跟踪 staged+unstaged、未跟踪预览、预算截断）；
 * 3) 请求组装 + fake LLM 流端到端（断言 system 含规则、user 含勾选文件 diff）。
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AI_BUILTIN_RULES,
  resolveAiRules,
  buildDiffPayload,
  buildAiRequest,
  runAiStream,
} from "/home/liu-yong/仓库/代码/private/dsh-git/lib/index.js";

let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✔ ${label}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ✘ ${label}${detail ? " — " + detail : ""}`); }
}

const base = "/tmp/dsh-git-ai-" + Date.now();
const ws = join(base, "ws");
const dshHome = join(base, "dshhome");
mkdirSync(ws, { recursive: true });
mkdirSync(dshHome, { recursive: true });
const oldDshHome = process.env.DSH_HOME;
process.env.DSH_HOME = dshHome;

// 真实 git 仓库：f1(staged), f2(unstaged), new.txt(untracked)
execSync("git init -q -b main", { cwd: ws });
execSync("git config user.email t@t && git config user.name T", { cwd: ws });
writeFileSync(join(ws, "f1"), "v1\n"); writeFileSync(join(ws, "f2"), "x\n");
execSync("git add f1 f2 && git commit -q -m init", { cwd: ws });
writeFileSync(join(ws, "f1"), "v2-change\n"); execSync("git add f1", { cwd: ws });
writeFileSync(join(ws, "f2"), "x-edited\n");
writeFileSync(join(ws, "new.txt"), "brand new\ncontent\n");

console.log("\n── 1) 规则就近解析 ──");
// 无任何规则文件 → 内置
let r = resolveAiRules(ws);
check("无文件 → builtin", r.source === "builtin", r.source);
// 全局规则
mkdirSync(join(dshHome, "rules"), { recursive: true });
writeFileSync(join(dshHome, "rules", "git-commit-rules.md"), "RULE-GLOBAL: 全用中文");
r = resolveAiRules(ws);
check("有全局 → global", r.source === "global" && r.text.includes("RULE-GLOBAL"), r.source);
// 工作区规则覆盖全局
mkdirSync(join(ws, ".dsh", "rules"), { recursive: true });
writeFileSync(join(ws, ".dsh", "rules", "git-commit-rules.md"), "RULE-WS: 必须写 feat");
r = resolveAiRules(ws);
check("有工作区 → workspace 优先", r.source === "workspace" && r.text.includes("RULE-WS"), r.source);

console.log("\n── 2) 差异载荷 ──");
const payload = buildDiffPayload(ws, ["f1", "f2", "new.txt"]);
const paths = payload.sections.map((s) => s.path);
check("sections 覆盖三文件", payload.sections.length === 3 && ["f1", "f2", "new.txt"].every((p) => paths.includes(p)), paths.join(","));
const f1 = payload.sections.find((s) => s.path === "f1")?.text || "";
const f2 = payload.sections.find((s) => s.path === "f2")?.text || "";
const nt = payload.sections.find((s) => s.path === "new.txt")?.text || "";
check("f1 含暂存修改 diff", f1.includes("-v1") && f1.includes("+v2-change"));
check("f2 含未暂存修改 diff", f2.includes("-x") && f2.includes("+x-edited"));
check("new.txt 走内容预览", nt.includes("brand new") && nt.includes("(new file"));
// 部分勾选只生成对应文件
const partial = buildDiffPayload(ws, ["f2"]);
check("部分勾选只含 f2", partial.sections.length === 1 && partial.sections[0].path === "f2");
// 空勾选
check("空勾选 → 无内容", buildDiffPayload(ws, []).sections.length === 0);

console.log("\n── 3) 请求组装 + fake LLM 流 ──");
const req = buildAiRequest({
  provider: "fake", model: "m", rules: resolveAiRules(ws),
  payload: buildDiffPayload(ws, ["f1", "new.txt"]), workspaceRoot: ws,
});
check("system 含规则文本", req.system.includes("RULE-WS"));
check("system 含输出要求", req.system.includes("只输出提交信息本体"));
check("user 为单条用户消息", req.messages.length === 1 && req.messages[0].role === "user");
check("user 含勾选文件 diff", req.messages[0].content[0].text.includes("### FILE: f1") && req.messages[0].content[0].text.includes("### FILE: new.txt"));

// fake LLM：捕获请求并回一条固定消息
const captured = [];
const fakeLlm = {
  async *stream(options) {
    captured.push(options);
    yield { type: "text-delta", text: "feat: add f1 change" };
    yield { type: "finish", reason: "stop" };
  },
};
const msg = await runAiStream(fakeLlm, { provider: "fake", model: "m", ...req }, undefined);
check("fake 流返回文本", msg === "feat: add f1 change");
check("stream 收到 provider/model/temperature", captured[0].provider === "fake" && captured[0].model === "m" && captured[0].temperature === 0.2);

// 内置默认规则非空
check("内置默认规则可读", typeof AI_BUILTIN_RULES === "string" && AI_BUILTIN_RULES.includes("Conventional"));

process.env.DSH_HOME = oldDshHome;
rmSync(base, { recursive: true, force: true });
console.log(`\n===== AI 宿主逻辑测试: ${pass} 通过, ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
