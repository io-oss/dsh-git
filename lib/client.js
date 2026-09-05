/**
 * @module dsh-git
 * Git 版本控制插件 — 客户端 UI
 *
 * 提供 Git 版本控制的面板 UI，集成到 DSH 的 Conversation View 标签页系统中。
 * 包含：仓库扫描、提交图、变更列表、Diff 对比、代码提交等功能。
 *
 * 与宿主的通信：直接 POST 宿主 webServer 上的 JSON 路由 /dsh-git/api
 * （不依赖 Remote 命名空间，避免 Cordis inject 限制）。
 *
 * 注意：文件顶层只允许存在 window.__ModuleLoader__.load({...}) 这一条语句，
 * 其余一切声明都必须放在工厂闭包内 —— 浏览器可能对同一脚本执行多次（HMR/
 * 预取），顶层 const/function 重复声明会抛 SyntaxError。
 */

window.__ModuleLoader__.load({
  id: "dsh-git",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react_jsx_runtime = require("react/jsx-runtime");
    let react = require("react");

    // ─── Git 客户端（fetch → /dsh-git/api）─────────────────────────

    const GIT_API_PATH = "/dsh-git/api";

    function createGitClient() {
      const call = async (method, params) => {
        try {
          const res = await fetch(GIT_API_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method, params: params ?? {} }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return await res.json(); // { ok: true, value } | { ok: false, error }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      };
      return {
        scanRepositories: (p) => call("scanRepositories", p),
        rescanRepositories: (p) => call("rescanRepositories", p),
        addRepository: (p) => call("addRepository", p),
        status: (p) => call("status", p),
        log: (p) => call("log", p),
        parsedLog: (p) => call("parsedLog", p),
        diff: (p) => call("diff", p),
        commit: (p) => call("commit", p),
        branches: (p) => call("branches", p),
        currentBranch: (p) => call("currentBranch", p),
        isRepo: (p) => call("isRepo", p),
        checkout: (p) => call("checkout", p),
        createBranch: (p) => call("createBranch", p),
        pull: (p) => call("pull", p),
        push: (p) => call("push", p),
        merge: (p) => call("merge", p),
        deleteBranch: (p) => call("deleteBranch", p),
        aiCommitMessage: (p) => call("aiCommitMessage", p),
      };
    }

    // ─── CSS 样式 ──────────────────────────────────────────────────

    const css_git = `
._git_root{height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden}
._git_header{padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
._git_headerLeft{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
._git_headerRight{display:flex;align-items:center;gap:6px}
._git_title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap}
._git_repoSelect{background:var(--dsw-alias-bg-module-platform);height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:8px;padding:0 10px;font-size:13px;line-height:20px;max-width:240px}
._git_repoSelect:hover{background:var(--dsw-alias-interactive-bg-hover)}
._git_repoName{background:var(--dsw-alias-bg-module-platform);height:32px;border-radius:8px;padding:0 10px;font-size:13px;line-height:32px;color:var(--dsw-alias-label-secondary);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
._git_btn{height:28px;padding:0 10px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;line-height:18px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
._git_btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
._git_btn:disabled{opacity:.4;cursor:not-allowed}
._git_btnPrimary{background:var(--dsw-alias-accent-bg);color:var(--dsw-alias-accent-fg);border-color:transparent}
._git_btnPrimary:hover{background:var(--dsw-alias-accent-bg-hover)}
._git_body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
._git_panels{flex:1;display:flex;min-height:0;overflow:hidden}
._git_leftPanel{width:50%;min-width:0;display:flex;flex-direction:column;border-right:.5px solid var(--dsw-alias-border-l2);overflow:hidden}
._git_rightPanel{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
._git_section{border-bottom:.5px solid var(--dsw-alias-border-l2)}
._git_sectionHeader{padding:8px 12px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
._git_sectionHeader:hover{background:var(--dsw-alias-interactive-bg-hover)}
._git_sectionContent{padding:4px 0}
._git_fileItem{display:flex;align-items:center;gap:6px;padding:4px 12px;cursor:pointer;font-size:13px;line-height:20px;transition:background .1s}
._git_fileItem:hover{background:var(--dsw-alias-interactive-bg-hover)}
._git_fileItem_active{background:var(--dsw-alias-accent-bg-subtle)}
._git_filePath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
._git_statusBadge{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex:none}
._git_statusA{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 20%,transparent);color:var(--dsw-alias-state-success-primary)}
._git_statusM{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 20%,transparent);color:var(--dsw-alias-state-warning-primary)}
._git_statusD{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 20%,transparent);color:var(--dsw-alias-state-error-primary)}
._git_diffView{padding:12px;overflow:auto;flex:1;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-all}
._git_diffHunk{color:var(--dsw-alias-label-tertiary);padding:4px 0;font-weight:500}
._git_diffAdd{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent);color:var(--dsw-alias-state-success-primary)}
._git_diffDel{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent);color:var(--dsw-alias-state-error-primary)}
._git_commitArea{padding:12px;border-top:.5px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:8px}
._git_commitInput{width:100%;min-height:60px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;resize:vertical;font-family:inherit;box-sizing:border-box}
._git_commitInput:focus{outline:none;border-color:var(--dsw-alias-accent-border)}
._git_commitRow{display:flex;align-items:center;gap:8px;justify-content:space-between}
._git_aiRow{display:flex;align-items:center;gap:8px;justify-content:flex-end}
._git_aiBtn{color:var(--dsw-alias-accent-fg);border-color:var(--dsw-alias-accent-border)}
._git_fileCheck{width:14px;height:14px;margin:0;flex:none;accent-color:var(--dsw-alias-accent-fg);cursor:pointer}
._git_graph{overflow:auto;flex:1;padding:8px 0;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px}
._git_graphNode{display:flex;align-items:flex-start;padding:2px 12px;cursor:pointer;transition:background .1s}
._git_graphNode:hover{background:var(--dsw-alias-interactive-bg-hover)}
._git_graphPrefix{white-space:pre;color:var(--dsw-alias-label-tertiary);flex:none;font-family:var(--ds-font-family-code)}
._git_graphMsg{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:4px}
._git_graphRef{display:inline-block;padding:0 4px;margin:0 2px;border-radius:3px;font-size:10px;line-height:16px;background:var(--dsw-alias-accent-bg-subtle);color:var(--dsw-alias-accent-fg)}
._git_graphHash{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-right:4px;flex:none}
._git_graphAuthor{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-left:auto;flex:none;white-space:nowrap;padding-left:8px;display:flex;align-items:center;gap:6px}
._git_graphDate{color:var(--dsw-alias-label-tertiary);opacity:.72}
._git_empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:12px;color:var(--dsw-alias-label-tertiary);padding:32px}
._git_emptyIcon{width:48px;height:48px;opacity:.4}
._git_emptyText{font-size:14px;line-height:20px;text-align:center}
._git_spinner{width:20px;height:20px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-accent-fg);border-radius:50%;animation:_git_spin .6s linear infinite}
@keyframes _git_spin{to{transform:rotate(360deg)}}
._git_loading{display:flex;align-items:center;justify-content:center;flex:1;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:13px}
._git_modalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:999}
._git_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:20px;min-width:400px;max-width:500px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
._git_modalTitle{font-size:14px;font-weight:500;margin-bottom:12px}
._git_modalInput{width:100%;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;margin-bottom:12px;box-sizing:border-box}
._git_modalInput:focus{outline:none;border-color:var(--dsw-alias-accent-border)}
._git_modalActions{display:flex;gap:8px;justify-content:flex-end}
._git_tabs{display:flex;border-bottom:.5px solid var(--dsw-alias-border-l2);padding:0 12px}
._git_tab{padding:8px 16px;font-size:13px;line-height:20px;cursor:pointer;color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;transition:all .1s;user-select:none}
._git_tab:hover{color:var(--dsw-alias-label-primary)}
._git_tabActive{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-accent-fg)}
._git_chevron{width:12px;height:12px;transition:transform .15s;flex:none}
._git_chevronOpen{transform:rotate(90deg)}
._git_count{font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module);padding:0 6px;border-radius:4px;line-height:16px}
._git_graphArea{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
._git_graphToolbar{padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
._git_graphToolbarLabel{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
._git_branchBar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}
._git_branchNow{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
._git_branchNow b{color:var(--dsw-alias-label-primary);font-weight:600}
._git_branchBar ._git_remoteSep{width:1px;height:18px;background:var(--dsw-alias-border-l2);flex:none}
`;
    const tagId = "dsh-git/styles.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-git";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css_git;
      document.head.appendChild(tag);
    }

    // ─── 工具函数 ──────────────────────────────────────────────────

    const STATUS_MAP = {
      A: { label: "A", cls: "_git_statusA", text: "新增" },
      M: { label: "M", cls: "_git_statusM", text: "修改" },
      D: { label: "D", cls: "_git_statusD", text: "删除" },
      R: { label: "R", cls: "_git_statusM", text: "重命名" },
      C: { label: "C", cls: "_git_statusA", text: "复制" },
      U: { label: "U", cls: "_git_statusUU", text: "未合并" },
      "??": { label: "?", cls: "_git_statusA", text: "未跟踪" },
    };

    function getStatusInfo(status) { return STATUS_MAP[status] || { label: status, cls: "_git_statusM", text: status }; }

    function parseDiffHunks(diffText) {
      if (!diffText) return [];
      const lines = diffText.split("\n");
      const hunks = [];
      let currentHunk = null;
      for (const line of lines) {
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (hunkMatch) {
          currentHunk = { header: line, lines: [] };
          hunks.push(currentHunk);
        } else if (currentHunk) {
          if (line.startsWith("+")) currentHunk.lines.push({ type: "add", text: line });
          else if (line.startsWith("-")) currentHunk.lines.push({ type: "del", text: line });
          else currentHunk.lines.push({ type: "ctx", text: line });
        }
      }
      return hunks;
    }

    // ─── 组件：Toast ───────────────────────────────────────────────

    function Toast({ toast }) {
      if (!toast) return null;
      const cls = toast.type === "success" ? "_git_toastSuccess" : "_git_toastError";
      return react_jsx_runtime.jsx("div", { className: `_git_toast ${cls}`, children: toast.message });
    }

    // ─── 组件：Git 提交图 ──────────────────────────────────────────

    /** 显示用短时间：'2026-09-04 11:53:02 +0800' → '2026-09-04 11:53' */
    function shortDate(iso) {
      return typeof iso === "string" && iso.length >= 16 ? iso.slice(0, 16) : (iso || "");
    }

    function GitGraph({ commits, onSelect }) {
      if (!commits || commits.length === 0) {
        return react_jsx_runtime.jsx("div", { className: "_git_empty", children: react_jsx_runtime.jsx("div", { className: "_git_emptyText", children: "暂无提交记录" }) });
      }
      return react_jsx_runtime.jsx("div", { className: "_git_graph", children: commits.map((commit, i) => {
        const refs = commit.refs ? commit.refs.match(/\(([^)]+)\)/)?.[1]?.split(", ") : [];
        return react_jsx_runtime.jsx("div", {
          className: "_git_graphNode",
          onClick: () => onSelect?.(commit),
          title: `${commit.hash}\n作者: ${commit.author} <${commit.email}>\n时间: ${commit.date}\n\n${commit.message}`,
          children: react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
            children: [
              commit.graphLine && react_jsx_runtime.jsx("span", { className: "_git_graphPrefix", children: commit.graphLine }),
              commit.shortHash && react_jsx_runtime.jsx("span", { className: "_git_graphHash", children: commit.shortHash }),
              refs && refs.length > 0 && refs.filter(r => r && !r.startsWith("tag: ")).map((ref, j) =>
                react_jsx_runtime.jsx("span", { className: "_git_graphRef", children: ref }, j)),
              react_jsx_runtime.jsx("span", { className: "_git_graphMsg", children: commit.message || "(no message)" }),
              react_jsx_runtime.jsxs("span", {
                className: "_git_graphAuthor",
                children: [
                  commit.author ? react_jsx_runtime.jsx("span", { children: commit.author }) : null,
                  shortDate(commit.date) && react_jsx_runtime.jsx("span", { className: "_git_graphDate", children: shortDate(commit.date) }),
                ],
              }),
            ],
          }),
        }, i);
      }) });
    }

    // ─── 组件：Diff 视图 ───────────────────────────────────────────

    function DiffView({ diffText, fileName }) {
      if (!diffText) {
        return react_jsx_runtime.jsx("div", { className: "_git_empty", children: react_jsx_runtime.jsx("div", { className: "_git_emptyText", children: fileName ? `选中文件: ${fileName}` : "选择一个文件查看差异" }) });
      }
      const hunks = parseDiffHunks(diffText);
      if (hunks.length === 0) {
        return react_jsx_runtime.jsx("div", { className: "_git_diffView", children: diffText.split("\n").map((line, i) => react_jsx_runtime.jsx("div", { children: line, style: { padding: "1px 0" } }, i)) });
      }
      return react_jsx_runtime.jsx("div", { className: "_git_diffView", children: hunks.map((hunk, i) =>
        react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
          children: [
            react_jsx_runtime.jsx("div", { className: "_git_diffHunk", children: hunk.header }),
            hunk.lines.map((line, j) => {
              let cls = line.type === "add" ? "_git_diffAdd" : line.type === "del" ? "_git_diffDel" : "";
              return react_jsx_runtime.jsx("div", { className: cls, children: line.text }, j);
            }),
          ],
        }, i)
      ) });
    }

    // ─── 组件：变更文件列表 ────────────────────────────────────────

    function ChangesPanel({ staged, unstaged, untracked, onSelectFile, selectedFile, excluded, onToggleExcluded }) {
      const [stagedOpen, setStagedOpen] = react.useState(true);
      const [unstagedOpen, setUnstagedOpen] = react.useState(true);
      const [untrackedOpen, setUntrackedOpen] = react.useState(true);
      const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

      if (!hasChanges) {
        return react_jsx_runtime.jsx("div", { className: "_git_empty", children: react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
          children: [react_jsx_runtime.jsx("svg", { className: "_git_emptyIcon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsx("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }) }), react_jsx_runtime.jsx("div", { className: "_git_emptyText", children: "工作区干净，无变更" })],
        }) });
      }

      function renderItem(file) {
        const info = getStatusInfo(file.status);
        const included = !excluded.has(file.path);
        return react_jsx_runtime.jsx("div", {
          className: `_git_fileItem ${selectedFile === file.path ? "_git_fileItem_active" : ""}`,
          onClick: () => onSelectFile(file.path, file.status),
          children: react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
            children: [
              react_jsx_runtime.jsx("input", {
                type: "checkbox",
                className: "_git_fileCheck",
                checked: included,
                onChange: () => onToggleExcluded(file.path),
                onClick: (e) => e.stopPropagation(),
                title: included ? "本次提交包含该文件" : "本次提交排除该文件",
              }),
              react_jsx_runtime.jsx("span", { className: `_git_statusBadge ${info.cls}`, children: info.label }),
              react_jsx_runtime.jsx("span", { className: "_git_filePath", children: file.path }),
            ],
          }),
        }, file.path);
      }

      function Section({ title, items, open, onToggle, count }) {
        if (items.length === 0) return null;
        return react_jsx_runtime.jsxs("div", { className: "_git_section", children: [
          react_jsx_runtime.jsxs("div", { className: "_git_sectionHeader", onClick: onToggle, children: [
            react_jsx_runtime.jsx("svg", { className: `_git_chevron ${open ? "_git_chevronOpen" : ""}`, viewBox: "0 0 12 12", fill: "currentColor", children: react_jsx_runtime.jsx("path", { d: "M4.5 2.5l3.5 3.5-3.5 3.5" }) }),
            title, react_jsx_runtime.jsx("span", { className: "_git_count", children: count }),
          ]}),
          open && react_jsx_runtime.jsx("div", { className: "_git_sectionContent", children: items.map(renderItem) }),
        ] });
      }

      return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
        children: [
          react_jsx_runtime.jsx(Section, { title: "已暂存 (Staged)", items: staged, open: stagedOpen, onToggle: () => setStagedOpen(!stagedOpen), count: staged.length }),
          react_jsx_runtime.jsx(Section, { title: "未暂存 (Unstaged)", items: unstaged, open: unstagedOpen, onToggle: () => setUnstagedOpen(!unstagedOpen), count: unstaged.length }),
          react_jsx_runtime.jsx(Section, { title: "未跟踪 (Untracked)", items: untracked.map((p) => ({ path: p, status: "??" })), open: untrackedOpen, onToggle: () => setUntrackedOpen(!untrackedOpen), count: untracked.length }),
        ],
      });
    }

    // ─── 组件：提交区域 ────────────────────────────────────────────

    function CommitArea({ value, onChange, onCommit, loading, pendingCount, onGenerate, generating }) {
      const canCommit = !loading && (value || "").trim() !== "" && pendingCount > 0;
      return react_jsx_runtime.jsxs("div", { className: "_git_commitArea", children: [
        react_jsx_runtime.jsx("textarea", {
          className: "_git_commitInput",
          placeholder: "输入提交信息 (Cmd+Enter 提交)；或点击右侧 AI 生成",
          value: value, onChange: (e) => onChange(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { if (canCommit) onCommit((value || "").trim()); } },
          disabled: loading, rows: 3,
        }),
        react_jsx_runtime.jsx("div", { className: "_git_aiRow", children: react_jsx_runtime.jsx("button", {
          className: "_git_btn _git_aiBtn",
          onClick: onGenerate,
          disabled: !onGenerate || generating || pendingCount === 0,
          title: pendingCount === 0 ? "请先勾选要提交的文件" : "根据当前勾选的变更生成提交信息（受 git-commit-rules.md 约束）",
          children: generating ? "AI 生成中…" : "✨ AI 生成提交信息",
        }) }),
        react_jsx_runtime.jsxs("div", { className: "_git_commitRow", children: [
          react_jsx_runtime.jsx("span", { className: "_git_count", children: pendingCount > 0 ? `将提交 ${pendingCount} 个文件` : "未勾选任何变更" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn _git_btnPrimary", onClick: () => onCommit((value || "").trim()), disabled: !canCommit, children: loading ? "提交中..." : `提交 (${pendingCount})` }),
        ] }),
      ] });
    }

    // ─── 组件：手动指定目录弹窗 ────────────────────────────────────

    function AddRepoModal({ open, onClose, onConfirm }) {
      const [path, setPath] = react.useState("");
      if (!open) return null;
      return react_jsx_runtime.jsx("div", { className: "_git_modalOverlay", onClick: onClose, children: react_jsx_runtime.jsxs("div", { className: "_git_modal", onClick: (e) => e.stopPropagation(), children: [
        react_jsx_runtime.jsx("div", { className: "_git_modalTitle", children: "手动指定 Git 仓库目录" }),
        react_jsx_runtime.jsx("input", { className: "_git_modalInput", placeholder: "输入包含 .git 的目录路径", value: path, onChange: (e) => setPath(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") { if (path.trim()) { onConfirm(path.trim()); setPath(""); } } if (e.key === "Escape") onClose(); }, autoFocus: true }),
        react_jsx_runtime.jsxs("div", { className: "_git_modalActions", children: [
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: onClose, children: "取消" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn _git_btnPrimary", onClick: () => { if (path.trim()) { onConfirm(path.trim()); setPath(""); } }, disabled: !path.trim(), children: "确认" }),
        ] }),
      ] }) });
    }

    // ─── 组件：新建分支弹窗 ────────────────────────────────────────

    function BranchModal({ open, onClose, onCreate }) {
      const [name, setName] = react.useState("");
      if (!open) return null;
      return react_jsx_runtime.jsx("div", { className: "_git_modalOverlay", onClick: onClose, children: react_jsx_runtime.jsxs("div", { className: "_git_modal", onClick: (e) => e.stopPropagation(), children: [
        react_jsx_runtime.jsx("div", { className: "_git_modalTitle", children: "新建分支并切换" }),
        react_jsx_runtime.jsx("input", {
          className: "_git_modalInput", placeholder: "分支名（如 feature/login）", value: name,
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => { if (e.key === "Enter") { if (name.trim()) { onCreate(name.trim()); setName(""); } } if (e.key === "Escape") onClose(); },
          autoFocus: true,
        }),
        react_jsx_runtime.jsxs("div", { className: "_git_modalActions", children: [
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: onClose, children: "取消" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn _git_btnPrimary", onClick: () => { if (name.trim()) { onCreate(name.trim()); setName(""); } }, disabled: !name.trim(), children: "创建" }),
        ] }),
      ] }) });
    }

    // ─── 组件：Git 视图主面板 ──────────────────────────────────────

    function GitView({ workspacePath, viewRequest, completeViewRequest, renderSlot, t }) {
      const [activeTab, setActiveTab] = react.useState("changes");
      const [repos, setRepos] = react.useState([]);
      const [selectedRepo, setSelectedRepo] = react.useState("");
      const [loading, setLoading] = react.useState(true);
      const [commits, setCommits] = react.useState([]);
      const [staged, setStaged] = react.useState([]);
      const [unstaged, setUnstaged] = react.useState([]);
      const [untracked, setUntracked] = react.useState([]);
      const [selectedFile, setSelectedFile] = react.useState(null);
      const [diffText, setDiffText] = react.useState("");
      const [committing, setCommitting] = react.useState(false);
      const [addRepoOpen, setAddRepoOpen] = react.useState(false);
      const [toast, setToast] = react.useState(null);
      const [branchFilter, setBranchFilter] = react.useState("ALL");
      // 未勾选（排除出本次提交）的文件路径集合
      const [excluded, setExcluded] = react.useState(() => new Set());
      // 提交信息（受控：供 AI 生成回填）
      const [commitMessage, setCommitMessage] = react.useState("");
      // AI 生成忙
      const [aiGenerating, setAiGenerating] = react.useState(false);
      // 分支：当前分支 / 待切换目标 / 操作忙 / 新建弹窗
      const [currentName, setCurrentName] = react.useState("");
      const [targetBranch, setTargetBranch] = react.useState("");
      const [busyBranch, setBusyBranch] = react.useState(false);
      const [branchModalOpen, setBranchModalOpen] = react.useState(false);
      const [branchList, setBranchList] = react.useState([]);
      // Git 桥接客户端：POST 宿主 JSON API（与 Cordis 注入无关）
      const git = react.useMemo(() => createGitClient(), []);

      const showToast = (message, type = "success") => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };

      const scanRepos = react.useCallback(async (force = false) => {
        // workspacePath = 当前会话所属工作区（宿主记于 session.cwd）。
        // 为空时宿主才回退多候选根（兜底）。
        setLoading(true);
        try {
          const method = force ? "rescanRepositories" : "scanRepositories";
          const result = await git[method](workspacePath ? { workspacePath } : {});
          if (result.ok) {
            const found = result.value.repositories;
            setRepos(found);
            // 默认选中：工作区根自身是仓库则选它，否则取第一个（多仓库子目录）
            const preferred = workspacePath && found.includes(workspacePath)
              ? workspacePath
              : (found[0] || "");
            if (preferred) setSelectedRepo((prev) => (prev === preferred ? prev : preferred));
          }
        } catch (err) { console.error("Scan repos failed:", err); }
        finally { setLoading(false); }
      }, [git, workspacePath]);

      react.useEffect(() => { scanRepos(false); }, [scanRepos]);

      const refreshStatus = react.useCallback(async () => {
        if (!git || !selectedRepo) return;
        try { const r = await git.status({ repoPath: selectedRepo }); if (r.ok) { setStaged(r.value.staged); setUnstaged(r.value.unstaged); setUntracked(r.value.untracked); } }
        catch (err) { console.error("Status failed:", err); }
      }, [git, selectedRepo]);

      const refreshLog = react.useCallback(async () => {
        if (!git || !selectedRepo) return;
        try {
          const params = { repoPath: selectedRepo, maxCount: 100 };
          if (branchFilter !== "ALL") params.branch = branchFilter;
          const r = await git.parsedLog(params);
          if (r.ok) setCommits(r.value);
        }
        catch (err) { console.error("Log failed:", err); }
      }, [git, selectedRepo, branchFilter]);

      const refreshBranches = react.useCallback(async () => {
        if (!git || !selectedRepo) return;
        try {
          const r = await git.branches({ repoPath: selectedRepo });
          if (r.ok) {
            const list = r.value.branches;
            const cur = r.value.current || "";
            setBranchList(list);
            setCurrentName(cur);
            setTargetBranch((prev) => (list.includes(prev) ? prev : cur));
            // 过滤目标失效（分支被删）时回到“所有分支”
            setBranchFilter((prev) => (prev === "ALL" || list.includes(prev) ? prev : "ALL"));
          }
        } catch (err) { console.error("Branches failed:", err); }
      }, [git, selectedRepo]);

      react.useEffect(() => {
        if (selectedRepo) {
          setLoading(true);
          setExcluded(new Set());
          setBranchList([]); setCurrentName(""); setTargetBranch("");
          Promise.all([refreshStatus(), refreshLog(), refreshBranches()]).finally(() => setLoading(false));
        }
      }, [selectedRepo, refreshStatus, refreshLog, refreshBranches]);

      const handleSelectFile = react.useCallback(async (filePath, status) => {
        setSelectedFile(filePath);
        if (!git || !selectedRepo) return;
        try { const isStaged = status === "A" || status === "M" || status === "D"; const r = await git.diff({ repoPath: selectedRepo, filePath, staged: isStaged }); setDiffText(r.ok ? r.value : ""); }
        catch (err) { setDiffText(""); }
      }, [git, selectedRepo]);

      const doGenerateAi = react.useCallback(async () => {
        if (!git || !selectedRepo || aiGenerating) return;
        // 只针对当前勾选的文件（与提交同一套 included 语义）
        const include = (p) => !excluded.has(p);
        const included = [
          ...staged.map((f) => f.path).filter(include),
          ...unstaged.map((f) => f.path).filter(include),
          ...untracked.filter(include),
        ];
        if (included.length === 0) { showToast("请先勾选要提交的文件", "error"); return; }
        setAiGenerating(true);
        try {
          const r = await git.aiCommitMessage({ repoPath: selectedRepo, workspacePath, included });
          if (r.ok) {
            setCommitMessage(r.message || "");
            showToast("已生成提交信息，可编辑后提交", "success");
          } else {
            showToast(r.error || "AI 生成失败", "error");
          }
        } catch (err) { showToast(err.message || "AI 生成失败", "error"); }
        finally { setAiGenerating(false); }
      }, [git, selectedRepo, workspacePath, staged, unstaged, untracked, excluded, aiGenerating]);

      const handleCommit = react.useCallback(async (message) => {
        if (!git || !selectedRepo) return;
        setCommitting(true);
        try {
          // 勾选参与本次提交：未暂存/未跟踪 → stage(add)；已暂存勾选保持；
          // 已暂存但未勾选 → unstage(取消暂存)，保证“勾什么提交什么”
          const include = (p) => !excluded.has(p);
          const stage = [...unstaged.map((f) => f.path), ...untracked].filter(include);
          const unstage = staged.map((f) => f.path).filter((p) => !include(p));
          const r = await git.commit({ repoPath: selectedRepo, message, all: false, stage, unstage });
          if (r.ok) {
            showToast("提交成功！", "success");
            setCommitMessage("");
            setSelectedFile(null); setDiffText("");
            setExcluded(new Set());
            await Promise.all([refreshStatus(), refreshLog()]);
          } else { showToast(r.error || "提交失败", "error"); }
        } catch (err) { showToast(err.message || "提交失败", "error"); }
        finally { setCommitting(false); }
      }, [git, selectedRepo, staged, unstaged, untracked, excluded, refreshStatus, refreshLog]);

      const handleAddRepo = react.useCallback(async (repoPath) => {
        setAddRepoOpen(false);
        // 配置归属当前工作区的 .dsh；列表就地合并新仓库
        try {
          const r = await git.addRepository(workspacePath ? { workspacePath, repoPath } : { repoPath });
          if (r.ok) {
            setRepos((prev) => (prev.includes(repoPath) ? prev : [...prev, repoPath]));
            setSelectedRepo(repoPath);
            showToast("仓库已添加", "success");
          } else {
            showToast(r.error || "添加仓库失败", "error");
          }
        } catch (err) { showToast(err.message || "添加仓库失败", "error"); }
      }, [git, workspacePath]);

      const doSwitchBranch = react.useCallback(async () => {
        if (!git || !selectedRepo || !targetBranch || targetBranch === currentName || busyBranch) return;
        setBusyBranch(true);
        try {
          const r = await git.checkout({ repoPath: selectedRepo, branch: targetBranch });
          if (r.ok) {
            showToast("已切换到分支 " + targetBranch, "success");
            setExcluded(new Set());
            await Promise.all([refreshStatus(), refreshLog(), refreshBranches()]);
          } else { showToast(r.error || "切换分支失败", "error"); }
        } catch (err) { showToast(err.message || "切换分支失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, targetBranch, currentName, busyBranch, refreshStatus, refreshLog, refreshBranches]);

      const doCreateBranch = react.useCallback(async (name) => {
        if (!git || !selectedRepo || busyBranch) return;
        setBranchModalOpen(false);
        setBusyBranch(true);
        try {
          const r = await git.createBranch({ repoPath: selectedRepo, branch: name });
          if (r.ok) {
            showToast("已创建并切换到 " + name, "success");
            setTargetBranch(name);
            await Promise.all([refreshStatus(), refreshLog(), refreshBranches()]);
          } else { showToast(r.error || "创建分支失败", "error"); }
        } catch (err) { showToast(err.message || "创建分支失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, busyBranch, refreshStatus, refreshLog, refreshBranches]);

      const doPull = react.useCallback(async () => {
        if (!git || !selectedRepo || busyBranch) return;
        setBusyBranch(true);
        try {
          const r = await git.pull({ repoPath: selectedRepo });
          if (r.ok) { showToast("拉取成功", "success"); await Promise.all([refreshStatus(), refreshLog(), refreshBranches()]); }
          else { showToast(r.error || "拉取失败", "error"); }
        } catch (err) { showToast(err.message || "拉取失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, busyBranch, refreshStatus, refreshLog, refreshBranches]);

      const doPush = react.useCallback(async () => {
        if (!git || !selectedRepo || busyBranch) return;
        setBusyBranch(true);
        try {
          const r = await git.push({ repoPath: selectedRepo });
          if (r.ok) { showToast("推送成功", "success"); }
          else { showToast(r.error || "推送失败", "error"); }
        } catch (err) { showToast(err.message || "推送失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, busyBranch]);

      const doMerge = react.useCallback(async () => {
        if (!git || !selectedRepo || !targetBranch || targetBranch === currentName || busyBranch) return;
        if (!window.confirm(`将分支 ${targetBranch} 合并到当前分支 ${currentName || "HEAD"}？`)) return;
        setBusyBranch(true);
        try {
          const r = await git.merge({ repoPath: selectedRepo, branch: targetBranch });
          if (r.ok) { showToast(`已合并 ${targetBranch}`, "success"); await Promise.all([refreshStatus(), refreshLog(), refreshBranches()]); }
          else {
            const isConflict = /CONFLICT|conflict/i.test(r.error || "");
            showToast(isConflict ? `合并冲突，请先解决冲突：${r.error}` : (r.error || "合并失败"), "error");
          }
        } catch (err) { showToast(err.message || "合并失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, targetBranch, currentName, busyBranch, refreshStatus, refreshLog, refreshBranches]);

      const doDeleteBranch = react.useCallback(async () => {
        if (!git || !selectedRepo || !targetBranch || targetBranch === currentName || busyBranch) return;
        if (!window.confirm(`删除本地分支 ${targetBranch}？（未合并分支将被拒绝，可用 -D 强制）`)) return;
        setBusyBranch(true);
        try {
          const r = await git.deleteBranch({ repoPath: selectedRepo, branch: targetBranch });
          if (r.ok) {
            showToast(`已删除分支 ${targetBranch}`, "success");
            setTargetBranch("");
            await Promise.all([refreshStatus(), refreshLog(), refreshBranches()]);
          } else { showToast(r.error || "删除失败", "error"); }
        } catch (err) { showToast(err.message || "删除失败", "error"); }
        finally { setBusyBranch(false); }
      }, [git, selectedRepo, targetBranch, currentName, busyBranch, refreshStatus, refreshLog, refreshBranches]);

      const handleRefresh = react.useCallback(async () => {
        setLoading(true);
        try { await scanRepos(true); if (selectedRepo) await Promise.all([refreshStatus(), refreshLog()]); }
        finally { setLoading(false); }
      }, [scanRepos, selectedRepo, refreshStatus, refreshLog]);

      // 空状态：无仓库
      if (!loading && repos.length === 0) {
        return react_jsx_runtime.jsxs("div", { className: "_git_root", children: [
          react_jsx_runtime.jsxs("div", { className: "_git_empty", children: [
            react_jsx_runtime.jsx("svg", { className: "_git_emptyIcon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsx("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }) }),
            react_jsx_runtime.jsx("div", { className: "_git_emptyText", children: "未检测到 Git 仓库" }),
            react_jsx_runtime.jsx("button", { className: "_git_btn _git_btnPrimary", onClick: () => setAddRepoOpen(true), children: "手动指定目录" }),
          ] }),
          react_jsx_runtime.jsx(AddRepoModal, { open: addRepoOpen, onClose: () => setAddRepoOpen(false), onConfirm: handleAddRepo }),
          react_jsx_runtime.jsx(Toast, { toast }),
        ] });
      }

      return react_jsx_runtime.jsxs("div", { className: "_git_root", children: [
        react_jsx_runtime.jsxs("div", { className: "_git_header", children: [
          react_jsx_runtime.jsxs("div", { className: "_git_headerLeft", children: [
            react_jsx_runtime.jsx("span", { className: "_git_title", children: "版本控制 (Git)" }),
            repos.length > 1
              ? react_jsx_runtime.jsx("select", { className: "_git_repoSelect", value: selectedRepo, onChange: (e) => setSelectedRepo(e.target.value), children: repos.map((r) => react_jsx_runtime.jsx("option", { value: r, children: r.split("/").pop() || r }, r)) })
              : repos.length === 1
                ? react_jsx_runtime.jsx("span", { className: "_git_repoName", title: selectedRepo, children: selectedRepo.split("/").pop() || selectedRepo })
                : null,
          ] }),
          react_jsx_runtime.jsxs("div", { className: "_git_headerRight", children: [
            react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: handleRefresh, disabled: loading, children: loading ? "刷新中..." : "刷新" }),
            react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: () => setAddRepoOpen(true), children: "添加仓库" }),
          ] }),
        ] }),
        !loading && selectedRepo && react_jsx_runtime.jsxs("div", { className: "_git_branchBar", children: [
          react_jsx_runtime.jsxs("span", { className: "_git_branchNow", children: ["当前分支", react_jsx_runtime.jsx("b", { children: currentName || "—" })] }),
          react_jsx_runtime.jsx("select", {
            className: "_git_repoSelect", value: targetBranch,
            onChange: (e) => setTargetBranch(e.target.value), disabled: busyBranch,
            title: "选择要切换到的分支",
            children: [
              !currentName && react_jsx_runtime.jsx("option", { value: "", children: "选择分支…", disabled: true }, ""),
              branchList.map((b) => react_jsx_runtime.jsx("option", { value: b, children: b === currentName ? b + "（当前）" : b }, b)),
            ],
          }),
          react_jsx_runtime.jsx("button", {
            className: "_git_btn", onClick: doSwitchBranch,
            disabled: busyBranch || !targetBranch || targetBranch === currentName,
            children: busyBranch ? "处理中..." : "切换",
          }),
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: doMerge, disabled: busyBranch || !targetBranch || targetBranch === currentName, title: "把下拉选中的分支合并到当前分支", children: "合并目标→当前" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: doDeleteBranch, disabled: busyBranch || !targetBranch || targetBranch === currentName, title: "删除下拉选中的本地分支", children: "删除目标" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: () => setBranchModalOpen(true), disabled: busyBranch, children: "新建分支" }),
          react_jsx_runtime.jsx("span", { className: "_git_remoteSep" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: doPull, disabled: busyBranch, title: "拉取当前分支的上游并合并", children: "拉取" }),
          react_jsx_runtime.jsx("button", { className: "_git_btn", onClick: doPush, disabled: busyBranch, title: "推送当前分支到上游", children: "推送" }),
        ] }),
        react_jsx_runtime.jsxs("div", { className: "_git_tabs", children: [
          react_jsx_runtime.jsx("div", { className: `_git_tab ${activeTab === "changes" ? "_git_tabActive" : ""}`, onClick: () => setActiveTab("changes"), children: "变更" }),
          react_jsx_runtime.jsx("div", { className: `_git_tab ${activeTab === "graph" ? "_git_tabActive" : ""}`, onClick: () => setActiveTab("graph"), children: "历史" }),
        ] }),
        loading
          ? react_jsx_runtime.jsx("div", { className: "_git_loading", children: react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [react_jsx_runtime.jsx("div", { className: "_git_spinner" }), "加载中..."] }) })
          : activeTab === "changes"
            ? react_jsx_runtime.jsxs("div", { className: "_git_panels", children: [
                react_jsx_runtime.jsx("div", { className: "_git_leftPanel", children: react_jsx_runtime.jsx(ChangesPanel, {
                  staged, unstaged, untracked, selectedFile, onSelectFile: handleSelectFile,
                  excluded, onToggleExcluded: (path) => setExcluded((prev) => {
                    const next = new Set(prev);
                    if (next.has(path)) next.delete(path); else next.add(path);
                    return next;
                  }),
                }) }),
                react_jsx_runtime.jsxs("div", { className: "_git_rightPanel", children: [
                  react_jsx_runtime.jsx(DiffView, { diffText, fileName: selectedFile }),
                  react_jsx_runtime.jsx(CommitArea, {
                    value: commitMessage, onChange: setCommitMessage,
                    onCommit: handleCommit, loading: committing,
                    pendingCount: staged.length + unstaged.length + untracked.length - excluded.size,
                    onGenerate: doGenerateAi, generating: aiGenerating,
                  }),
                ] }),
              ]})
            : react_jsx_runtime.jsxs("div", { className: "_git_graphArea", children: [
                react_jsx_runtime.jsxs("div", { className: "_git_graphToolbar", children: [
                  react_jsx_runtime.jsx("span", { className: "_git_graphToolbarLabel", children: "分支" }),
                  react_jsx_runtime.jsx("select", { className: "_git_repoSelect", value: branchFilter, onChange: (e) => setBranchFilter(e.target.value), children: [
                    react_jsx_runtime.jsx("option", { value: "ALL", children: "所有分支" }, "ALL"),
                    branchList.map((b) => react_jsx_runtime.jsx("option", { value: b, children: b }, b)),
                  ] }),
                ] }),
                react_jsx_runtime.jsx(GitGraph, { commits, onSelect: (c) => {} }),
              ]}),
        react_jsx_runtime.jsx(AddRepoModal, { open: addRepoOpen, onClose: () => setAddRepoOpen(false), onConfirm: handleAddRepo }),
        react_jsx_runtime.jsx(BranchModal, { open: branchModalOpen, onClose: () => setBranchModalOpen(false), onCreate: doCreateBranch }),
        react_jsx_runtime.jsx(Toast, { toast }),
      ] });
    }

    // ─── 插件注册 ──────────────────────────────────────────────────

    const NS = "dsh-git";
    const zh = {
      "view.git": "版本控制 (Git)", "tab.changes": "变更", "tab.history": "历史",
      "empty.noRepo": "未检测到 Git 仓库", "empty.clean": "工作区干净，无变更", "empty.noCommits": "暂无提交记录",
      "staged": "已暂存 (Staged)", "unstaged": "未暂存 (Unstaged)", "untracked": "未跟踪 (Untracked)",
      "commit.placeholder": "输入提交信息 (Cmd+Enter 提交)", "commit.button": "提交 (Commit)",
      "commit.success": "提交成功！", "commit.fail": "提交失败",
      "refresh": "刷新", "addRepo": "添加仓库",
      "addRepo.title": "手动指定 Git 仓库目录", "addRepo.placeholder": "输入包含 .git 的目录路径",
      "addRepo.success": "仓库已添加", "addRepo.fail": "添加仓库失败", "loading": "加载中...",
    };
    const en = {
      "view.git": "Git", "tab.changes": "Changes", "tab.history": "History",
      "empty.noRepo": "No Git repository detected", "empty.clean": "Working tree clean", "empty.noCommits": "No commits yet",
      "staged": "Staged", "unstaged": "Unstaged", "untracked": "Untracked",
      "commit.placeholder": "Commit message (Cmd+Enter to commit)", "commit.button": "Commit",
      "commit.success": "Commit successful!", "commit.fail": "Commit failed",
      "refresh": "Refresh", "addRepo": "Add Repository",
      "addRepo.title": "Specify Git repository directory", "addRepo.placeholder": "Enter path containing .git",
      "addRepo.success": "Repository added", "addRepo.fail": "Failed to add repository", "loading": "Loading...",
    };

    // 注意：slot 的注册与 inject 回调运行在插件自身 fiber 内 —— 要在这里读
    // ctx.sessions，必须像 ui-trajectory 一样声明 "sessions"/"uiSession"。
    const inject = ["slots", "sessions", "uiSession", "uiConversation", "layout", "locale"];

    /**
     * 当前"选中工作区"的目录：当前会话 cwd（宿主把会话的工作区根记在 cwd）。
     * 解析失败打印原因并返回空串（宿主此时才回退多候选根，属兜底）。
     */
    function currentWorkspacePath(ctx, sessionId) {
      const warn = (why) => console.warn("[dsh-git] currentWorkspacePath 解析失败:", why);
      try {
        const snapshot = ctx.sessions.list.getSnapshot();
        const currentId = snapshot?.current;
        const id = typeof currentId === "string" && currentId !== "" ? currentId : sessionId;
        if (id !== undefined) {
          const summary = snapshot.byId?.[id];
          const cwd = summary?.cwd;
          if (typeof cwd === "string" && cwd !== "") return cwd;
          warn(`会话 ${String(id)} 无 cwd (summary=${summary === undefined ? "缺失" : JSON.stringify(summary)})`);
        } else {
          warn("无 current 会话且无 sessionId");
        }
      } catch (err) {
        warn(err instanceof Error ? err.message : String(err));
      }
      return "";
    }

    function apply(ctx) {
      // 注册多语言
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-git: dictionaries");
      const t = ctx.locale.bind(NS);

      // 注册 Conversation View 标签页。
      // 组件内部自行创建 fetch 客户端访问宿主 JSON API；inject 仅透传
      // "当前选中工作区目录"（当前会话 cwd），扫描即锁定该工作区单根。
      ctx.slots.inject("conversation.view", () => {
        return ctx.slots.register({
          name: "conversation.view",
          id: "dsh-git",
          order: 20,
          label: () => t("view.git"),
          locale: NS,
          inject: (sessionId) => ({ workspacePath: currentWorkspacePath(ctx, sessionId) }),
        }, GitView);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});