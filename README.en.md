# dsh-git

A native Git version control plugin for the DeepSeek Harness Web GUI (`dsh web`).

## Features

- **Tab integration**: Adds a **"Git"** tab alongside the native "Chat" and "Trajectory" tabs in the DSH main tab bar, following the DSH theme (dark/light adaptive).
- **Repository scanning & caching**:
  - On first open, scans the workspace root (depth 0) and its first-level subdirectories (depth 1) for `.git` directories;
  - Persists results to `.dsh/git_repos.json` with a scan timestamp and a list of absolute repository paths; subsequent opens read the cache directly, skipping the full scan;
  - **Multi-repository support**: a dropdown in the toolbar switches between repositories; all operations (Graph, Changes, Diff, Commit) are scoped to the selected repository.
- **Manual directory specification**: when no repository is found at depth 0 or 1, an empty-state panel shows "No Git repository detected" with a "Specify manually" button; the entered path is written to `.dsh/git_repos.json` and the view refreshes immediately.
- **Refresh mechanism**: the toolbar "Refresh" button clears the cache, performs a full re-scan, and updates the dropdown list and current view data.
- **Git Graph (commit graph)**:
  - Parses `git log --graph --pretty=format:"%h %d %s [%an]"` output and renders a visual node graph;
  - Clearly shows branch/merge topology; hover over a node to view the commit ID, author, date, and full message.
- **Changes file list**:
  - Displays Staged / Unstaged / Untracked files in three collapsible sections;
  - File status is color/icon coded (A = Added, M = Modified, D = Deleted, ?? = Untracked).
- **Diff View**:
  - Click any file in the changes list to see its diff in the right panel;
  - Unified format with highlighted added/deleted lines.
- **Branch management**: the toolbar always shows the current branch — switch (checkout), create from current HEAD, **merge** the picked branch into the current one, **delete** a branch (`-d` when merged; unmerged/conflicting states surface git's error), **pull** upstream and **push** the current branch.
- **AI-generated commit message**: the **✨ Generate** button in the commit area calls the DSH host LLM service with the currently checked changes (editable afterwards).
  - Rules (nearest wins): `<workspaceRoot>/.dsh/rules/git-commit-rules.md` → `~/.dsh/rules/git-commit-rules.md` (`$DSH_HOME` first) → built-in Conventional Commits default;
  - Model follows the deployment default (session model catalog / `LLM_API_*` / deepseek fallback); diff input has total/per-file budgets with truncation notices; if the host exposes no LLM the button is disabled with a friendly note — manual entry always works.
- **Commit**:
  - Multi-line textarea for the commit message with `Cmd+Enter` shortcut support;
  - Automatically runs `git add -A` followed by `git commit -m "..."`;
  - Clears the input, refreshes the changes list and graph, and shows a success/failure Toast notification.
- **Non-blocking UI**: all Git operations (status / log / diff / commit) run asynchronously; long-running tasks show a Loading Spinner to keep the UI responsive.
- **Error handling**: Git execution errors (uninitialized repository, permission denied, merge conflicts, etc.) are caught and shown as friendly Toast notifications.

## Install

```sh
# 1) Install into the web profile (run OUTSIDE the plugin dir, use an absolute path)
dsh plugin --profile web add /absolute/path/to/dsh-git
```

> ⚠️ The path must be the real location of the plugin project — prefer an absolute path. Running `add ./dsh-git` from inside the project resolves to a non-existent nested path and the plugin will not activate.
> After the install, `~/.dsh/profiles/web/package.json` should contain `"dsh-git": "link:…"` and `dsh.profile.bundles` should list `"dsh-git"` (the reconcile step appends it automatically; add it by hand if missing).

```sh
# 2) Restart dsh web, then hard-refresh the browser page
```

## Usage

| Action | Where / How |
| --- | --- |
| Switch to the Git tab | Click the **"Git"** tab in the main tab bar |
| Switch repository | Use the dropdown in the toolbar (shown with multiple repositories) |
| View changes | The "Changes" tab is active by default; the left panel lists Staged / Unstaged / Untracked files |
| View file diff | Click any file in the left panel to see its diff on the right |
| Commit | Type a commit message at the bottom and click "Commit" or press `Cmd+Enter` |
| View commit history | Switch to the "History" tab to see the branch commit graph |
| Switch / merge / delete branch | pick a target in the toolbar dropdown → Switch / Merge→current / Delete |
| Pull / Push | the "Pull" and "Push" buttons in the toolbar |
| Force re-scan | The "Refresh" button in the toolbar |
| Add repository manually | The "Add Repository" button; enter a path containing `.git` |

### Empty state

When no Git repository is detected, the panel shows **"No Git repository detected"** with a **"Specify manually"** button.

## How it works

- **Host half (`lib/index.js`, a Cordis plugin)**
  - Exports the plugin name `dsh-git` (matches the insert id in `cordis.patch.yml`);
  - `GitService` is a **plain logic class** (no framework dependency) executing Git commands via `child_process.execSync` (status / log / diff / commit / branch, etc.), always with an explicit cwd and a timeout;
  - Mounted with scoped inject on the host `webServer` at the exact route **`POST /dsh-git/api`** (JSON body `{ method, params }` → `{ ok, value }` / `{ ok, error }`), with a method allowlist; hosts without a `webServer` skip it safely;
  - Auto-scan target (when `workspacePath` is omitted) falls back to the host `sandboxPolicy` workspace root, then `process.cwd()`;
  - Caches repository scans in `.dsh/git_repos.json`; first open reads the cache, refresh forces a re-scan.
- **Browser half (`lib/client.js`)**
  - Loaded via `window.__ModuleLoader__` under the bundle id `dsh-git`;
  - `GitView` builds a `createGitClient()` that talks to the host via `fetch` POST `/dsh-git/api` — no Remote namespaces or Cordis service injection, avoiding "without inject" restrictions;
  - The scan target comes from the slot inject: the current session's workspace directory (`sessions.current` cwd), exactly the DSH-selected workspace;
  - Registers the new tab in the `conversation.view` slot (`order: 20`, after Chat at 0 and Trajectory at 10); the slot inject reads no ctx services;
  - CSS uses the `--dsw-alias-*` design tokens, injected inline, and follows the GUI light/dark theme.

## Development

This plugin is pure JavaScript — no TypeScript compilation or bundling step is needed:

```sh
npm run test         # functional smoke tests (full flow on a temp repo + read-only checks on the current workspace)
npm run test:ai       # AI commit-message host logic tests (rules resolution / diff payload / fake LLM stream)
```

The smoke tests cover: repository scanning & caching, staged/unstaged/untracked parsing, single- and multi-branch (including merge) graph parsing, diff (worktree/staged), the full commit flow, branch queries, and isRepo.

After editing `lib/index.js` (host) or `lib/client.js` (browser), **restart `dsh web`** and hard-refresh the browser page.

## File structure

```
dsh-git/
├── package.json              # Plugin manifest (dsh.bundle.patch / dsh.client declarations)
├── cordis.patch.yml          # Bundle patch: inserts dsh-git into the profile loader layers
├── .gitignore
├── scripts/
│   └── smoke-test.mjs        # Functional smoke tests
├── lib/
│   ├── index.js              # Host: GitService + /dsh-git/api JSON route
│   ├── client.js             # Browser UI (single file, inline CSS + fetch client)
│   └── types/
│       ├── index.d.ts        # Type definitions
│       └── client/
│           └── index.d.ts    # Client type extensions
└── README.md / README.en.md
```

## API Reference

Methods exposed through `POST /dsh-git/api` (11; omit `workspacePath` to fall back to the host workspace root):

| Method | Parameters | Returns |
| --- | --- | --- |
| `scanRepositories` | `{ workspacePath }` | `{ last_scan, repositories[] }` |
| `rescanRepositories` | `{ workspacePath }` | `{ last_scan, repositories[] }` |
| `addRepository` | `{ workspacePath, repoPath }` | `{ last_scan, repositories[] }` |
| `status` | `{ repoPath }` | `{ staged[], unstaged[], untracked[] }` |
| `log` | `{ repoPath, maxCount? }` | `string` (raw graph output) |
| `parsedLog` | `{ repoPath, maxCount? }` | `Commit[]` (structured commit data) |
| `diff` | `{ repoPath, filePath, staged? }` | `string` (diff text) |
| `commit` | `{ repoPath, message, all? }` | `{ ok, output?, error? }` |
| `branches` | `{ repoPath }` | `{ current, branches[] }` |
| `currentBranch` | `{ repoPath }` | `string` |
| `isRepo` | `{ repoPath }` | `boolean` |
| `checkout` | `{ repoPath, branch }` | `{ ok, output?, error? }` |
| `createBranch` | `{ repoPath, branch }` | `{ ok, output?, error? }` |
| `pull` | `{ repoPath }` | `{ ok, output?, error? }` |
| `push` | `{ repoPath }` | `{ ok, output?, error? }` |
| `merge` | `{ repoPath, branch }` | `{ ok, output?, error? }` |
| `deleteBranch` | `{ repoPath, branch, force? }` | `{ ok, output?, error? }` |
| `aiCommitMessage` | `{ repoPath, workspacePath?, included[], provider?, model? }` | `{ ok, message } / { ok, error }` |

## Security boundary

- The plugin executes real Git commands on the host machine via `child_process.execSync`, operating on the host filesystem;
- All Git operations are scoped to user-specified repository paths — no out-of-bounds directory access;
- The plugin does not expose arbitrary shell execution to the client; only the predefined Git operations above are available.
- The API route sits behind the host request fence (401 without credentials, 403 for cross-site Origins).

## Known limitations

- Diff view is Unified format only (no Side-by-side yet);
- Binary files and files >1MB are not yet specially detected or handled;
- The Graph is rendered as plain text/HTML, not Canvas/SVG, so performance may degrade on very large repositories;
- Commit uses `git add -A` for all changes; selective staging is not yet supported;
- Auto-scan targets the **currently selected workspace** (the active session's cwd — the workspace root the host records for the session, same convention dsh-terminal uses for its default terminal directory); it only falls back to the host candidate roots when that cannot be resolved.

## License

MIT