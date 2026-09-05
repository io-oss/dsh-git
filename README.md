# dsh-git

为 DeepSeek Harness Web GUI（`dsh web`）提供的原生 Git 版本控制插件。

## 功能

- **Tab 标签页集成**：在 DSH 主界面标签栏中新增 **"版本控制 (Git)"** 标签页，与"对话"、"轨迹"并列，遵循 DSH 原生主题（暗色/亮色自适应）。
- **仓库扫描与缓存**：
  - 首次打开时全量扫描工作区根目录（深度 0）及第一级子目录（深度 1），检测 `.git` 目录；
  - 扫描结果持久化至 `.dsh/git_repos.json`，含扫描时间戳与仓库绝对路径列表，下次打开直接读取缓存跳过全量扫描；
  - 支持**多仓库**：顶部下拉选择器切换，所有操作（Graph、变更、Diff、提交）严格基于当前选中仓库执行。
- **手动指定目录**：深度 0 / 深度 1 均未检测到仓库时，展示"未检测到 Git 仓库"空状态面板，提供"手动指定目录"按钮，输入路径后写入 `.dsh/git_repos.json` 并立即刷新视图。
- **刷新机制**：工具栏"刷新"按钮强制清空缓存、重新全量扫描，同步更新下拉选项与当前视图数据。
- **Git Graph（提交图）**：
  - 解析 `git log --graph --pretty=format:"%h %d %s [%an]"` 输出，渲染为可视化节点图；
  - 清晰展示分支合并脉络，悬停节点查看 Commit ID、作者、时间与完整提交信息。
- **变更文件列表（Changes）**：
  - 展示已暂存（Staged）、未暂存（Unstaged）、未跟踪（Untracked）三栏，可折叠；
  - 文件状态用不同颜色/图标区分（A 新增、M 修改、D 删除、?? 未跟踪）。
- **文件内容对比（Diff View）**：
  - 点击变更列表中的任意文件，在右侧面板展示差异对比；
  - 统一格式（Unified）高亮显示增删行。
- **分支管理**：工具栏常驻显示当前分支——切换（checkout）、新建分支并切换（基点＝工具条下拉选中的分支；未选则当前 HEAD）、**合并**目标分支到当前分支、删除目标分支（已合并 `-d`，冲突/未合并报错）、**拉取**上游（pull）与**推送**当前分支（push）。
- **AI 生成提交信息**：提交区 **✨ AI 生成提交信息** 按钮基于当前勾选的变更在宿主侧调用 DSH 的 LLM 服务生成提交信息（可再编辑）。
  - 规则约束（就近覆盖）：`<工作区根>/.dsh/rules/git-commit-rules.md` → `~/.dsh/rules/git-commit-rules.md`（`$DSH_HOME` 优先）→ 内置 Conventional Commits 默认规则；
  - 模型跟随部署默认（宿主 session 模型目录/`LLM_API_*`/deepseek 兜底）；差异输入有总量/单文件预算并自动截断标注；宿主未提供 LLM 时该功能禁用并提示，手动填写不受影响。
- **代码提交（Commit）**：
  - 多行文本输入框填写 Commit Message，支持 `Cmd+Enter` 快捷键；
  - 逐项勾选要提交的文件后执行 `git add <所选>`（已暂存但未勾选的自动取消暂存）并 `git commit -m "..."`；
  - 提交成功后自动清空输入框、刷新变更列表与 Graph，并通过 Toast 通知成功/失败。
- **非阻塞 UI**：所有 Git 操作（status / log / diff / commit）异步执行，长耗时操作展示 Loading Spinner，防止界面假死。
- **错误处理**：捕获 Git 执行异常（未初始化仓库、权限拒绝、合并冲突等），通过友好的 Toast 通知反馈。

## 安装

```sh
# 1) 安装到 web profile（在插件目录【外】执行，用绝对路径）
dsh plugin --profile web add /绝对/路径/dsh-git
```

> ⚠️ 路径必须是插件项目的真实路径，推荐绝对路径。在项目目录内执行 `add ./dsh-git` 会被解析成不存在的嵌套路径，插件不会激活。
> 安装成功后 `~/.dsh/profiles/web/package.json` 应出现 `"dsh-git": "link:…"`，且 `dsh.profile.bundles` 列表包含 `"dsh-git"`（由 reconcile 自动追加；如缺失请手动补上）。

```sh
# 2) 重启 dsh web，再硬刷新浏览器页面
```

## 使用

| 操作              | 位置/方式                                                |
| ----------------- | -------------------------------------------------------- |
| 切换到 Git 标签页 | 主界面标签栏点击**"版本控制 (Git)"**                     |
| 切换仓库          | 顶部工具栏下拉选择器（多仓库时显示）                     |
| 查看变更          | 默认"变更"标签页，左侧列示已暂存/未暂存/未跟踪文件       |
| 查看文件差异      | 点击左侧任一文件，右侧面板展示差异                       |
| 提交代码          | 底部输入框填写 Commit Message，点"提交"或按`Cmd+Enter` |
| 查看提交历史      | 切换"历史"标签页，查看分支提交图                         |
| 切换/合并/删除分支 | 工具条下拉选目标分支 → 切换 / 合并目标→当前 / 删除目标 |
| 拉取 / 推送          | 工具条“拉取”“推送”按钮                                 |
| 强制重扫          | 工具栏"刷新"按钮                                         |
| 手动添加仓库      | "添加仓库"按钮，输入包含`.git` 的目录路径              |

### 空状态

未检测到任何 Git 仓库时，面板中央展示 **"未检测到 Git 仓库"** 提示与 **"手动指定目录"** 按钮。

## 工作原理

- **服务端（`lib/index.js`，Cordis 插件）**
  - 导出插件名 `dsh-git`（与 `cordis.patch.yml` 的 insert id 一致）；
  - `GitService` 为**纯逻辑类**（无框架依赖），通过 `child_process.execSync` 执行 Git 命令（status / log / diff / commit / branch 等），全部带 cwd 限定与超时保护；
  - 以 scoped inject 挂到宿主 `webServer` 的精确路由 **`POST /dsh-git/api`**（JSON body：`{ method, params }` → `{ ok, value }` / `{ ok, error }`），方法走白名单；无 `webServer` 的宿主安全跳过；
  - 自动扫描目标（未显式传 `workspacePath` 时）回退到宿主 `sandboxPolicy` 工作区根 → `process.cwd()`；
  - 仓库扫描结果缓存至工作区 `.dsh/git_repos.json`，首次读缓存、刷新强制重扫。
- **客户端（`lib/client.js`，浏览器插件）**
  - 通过 `window.__ModuleLoader__` 加载，bundle id 为 `dsh-git`；
  - `GitView` 内部 `createGitClient()` 用 `fetch` POST `/dsh-git/api` 与宿主通信——不依赖 Remote 命名空间 / Cordis 服务注入，规避 "without inject" 类限制；
  - 扫描目标来自 slot inject 透传的"当前会话工作区目录"（`sessions.current` 的 cwd），精确对应 DSH 当前选中的工作区；
  - 挂载于 `conversation.view` 槽位（`order: 20`，排在"对话"0 与"轨迹"10 之后）新增标签页，slot inject 不读任何 ctx 服务；
  - CSS 使用 `--dsw-alias-*` 设计令牌，内联注入，随 GUI 深浅主题自动切换。

## 开发

本插件为纯 JS 实现，无 TypeScript 编译或打包步骤：

```sh
npm run test         # 功能冒烟测试（临时仓库全链路 + 当前工作区只读，需 git 环境）
npm run test:ai       # AI 提交信息宿主逻辑测试（规则解析/diff 载荷/fake LLM 流）
```

冒烟测试覆盖：仓库扫描与缓存、status 暂存/未暂存/未跟踪解析、单分支与多分支（含 merge）graph 解析、diff（工作区/已暂存）、commit 全链路、分支查询、isRepo 判定。

修改 `lib/index.js`（服务端）或 `lib/client.js`（客户端）后，**重启 `dsh web`** 并硬刷新浏览器页面生效。

## 文件结构

```
dsh-git/
├── package.json              # 插件清单（dsh.bundle.patch / dsh.client 声明）
├── cordis.patch.yml          # bundle patch：把 dsh-git 插入 profile loader 层
├── .gitignore
├── scripts/
│   └── smoke-test.mjs        # 功能冒烟测试
├── lib/
│   ├── index.js              # 主机端：GitService + /dsh-git/api JSON 路由
│   ├── client.js             # 客户端 UI 组件（单文件，内联 CSS + fetch 客户端）
│   └── types/
│       ├── index.d.ts        # 类型定义
│       └── client/
│           └── index.d.ts    # 客户端类型扩展
└── README.md / README.en.md
```

## API 参考

通过 `POST /dsh-git/api`（JSON-RPC 风格）暴露的方法（11 个），`workspacePath` 省略时由宿主回退工作区根：

| 方法                   | 参数                                | 返回                                      |
| ---------------------- | ----------------------------------- | ----------------------------------------- |
| `scanRepositories`   | `{ workspacePath }`               | `{ last_scan, repositories[] }`         |
| `rescanRepositories` | `{ workspacePath }`               | `{ last_scan, repositories[] }`         |
| `addRepository`      | `{ workspacePath, repoPath }`     | `{ last_scan, repositories[] }`         |
| `status`             | `{ repoPath }`                    | `{ staged[], unstaged[], untracked[] }` |
| `log`                | `{ repoPath, maxCount? }`         | `string`（原始 graph 输出）             |
| `parsedLog`          | `{ repoPath, maxCount? }`         | `Commit[]`（结构化提交数据）            |
| `diff`               | `{ repoPath, filePath, staged? }` | `string`（diff 文本）                   |
| `commit`             | `{ repoPath, message, all? }`     | `{ ok, output?, error? }`               |
| `branches`           | `{ repoPath }`                    | `{ current, branches[] }`               |
| `currentBranch`      | `{ repoPath }`                    | `string`                                |
| `isRepo`             | `{ repoPath }`                    | `boolean`                               |
| `checkout`           | `{ repoPath, branch }`          | `{ ok, output?, error? }`               |
| `createBranch`       | `{ repoPath, branch }`          | `{ ok, output?, error? }`               |
| `pull`               | `{ repoPath }`                    | `{ ok, output?, error? }`               |
| `push`               | `{ repoPath }`                    | `{ ok, output?, error? }`               |
| `merge`              | `{ repoPath, branch }`          | `{ ok, output?, error? }`               |
| `deleteBranch`       | `{ repoPath, branch, force? }`  | `{ ok, output?, error? }`               |
| `aiCommitMessage`   | `{ repoPath, workspacePath?, included[], provider?, model? }` | `{ ok, message } / { ok, error }` |

## 安全边界

- 插件通过 `child_process.execSync` 在宿主机执行真实 Git 命令，操作宿主机文件系统；
- 所有 Git 操作限定在用户指定的仓库路径内，不越界访问其他目录；
- 不向客户端暴露任意 shell 执行能力，仅暴露上述预定义 Git 操作接口；
- API 路由置于宿主请求围栏（无凭证 401、跨站 Origin 403）之后。

## 已知限制

- Diff 为统一格式（Unified），暂不支持并排双栏（Side-by-side）；
- 二进制文件与超大文件（>1MB）尚未做特殊检测与友好提示；
- Graph 以纯文本/HTML 渲染，非 Canvas/SVG，超大仓库性能可能下降；
- 提交为 `git add -A` 全量添加，暂不支持选择性暂存；
- 自动扫描锁定**当前选中的工作区**（当前会话 cwd，即宿主为会话记录的工作区根，与 dsh-terminal 终端默认目录一致）；仅当无法解析时才回退宿主候选根集合。

## License

MIT
