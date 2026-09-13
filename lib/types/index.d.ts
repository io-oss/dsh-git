/** Git 版本控制插件类型定义 */

export interface GitReposConfig {
  last_scan: string;
  repositories: string[];
}

export interface FileStatus {
  path: string;
  status: string;
}

export interface GitStatus {
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  refs: string;
  parents: string[];
  graphLine: string;
}

export interface GitCommitResult {
  ok: boolean;
  output?: string;
  error?: string;
}

export interface GitBranches {
  current: string;
  branches: string[];
}

export interface ScanRequest { workspacePath: string }
export interface AddRepoRequest { workspacePath: string; repoPath: string }
export interface RepoRequest { repoPath: string }
export interface LogRequest extends RepoRequest { maxCount?: number }
/** diff 区域：已暂存 / 未暂存 / 未跟踪 */
export type DiffArea = "staged" | "unstaged" | "untracked";
export interface DiffRequest extends RepoRequest { filePath: string; area?: DiffArea; staged?: boolean }
export interface CommitRequest extends RepoRequest { message: string; files?: string[]; all?: boolean; stage?: string[]; unstage?: string[] }
export interface BranchOpRequest extends RepoRequest { branch: string; force?: boolean; startPoint?: string }
export interface AiCommitRequest extends RepoRequest { workspacePath?: string; included: string[]; provider?: string; model?: string }
export interface AiCommitResult { ok: true; message: string } | { ok: false; error: string }

export interface GitRemote {
  scanRepositories(request: ScanRequest): Promise<{ ok: boolean; value: GitReposConfig }>;
  rescanRepositories(request: ScanRequest): Promise<{ ok: boolean; value: GitReposConfig }>;
  addRepository(request: AddRepoRequest): Promise<{ ok: boolean; value: GitReposConfig }>;
  status(request: RepoRequest): Promise<{ ok: boolean; value: GitStatus }>;
  log(request: LogRequest): Promise<{ ok: boolean; value: string }>;
  parsedLog(request: LogRequest): Promise<{ ok: boolean; value: GitCommit[] }>;
  diff(request: DiffRequest): Promise<{ ok: boolean; value: string }>;
  commit(request: CommitRequest): Promise<{ ok: boolean; value: GitCommitResult }>;
  branches(request: RepoRequest): Promise<{ ok: boolean; value: GitBranches }>;
  currentBranch(request: RepoRequest): Promise<{ ok: boolean; value: string }>;
  isRepo(request: RepoRequest): Promise<{ ok: boolean; value: boolean }>;
  checkout(request: BranchOpRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  createBranch(request: BranchOpRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  pull(request: RepoRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  push(request: RepoRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  merge(request: BranchOpRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  deleteBranch(request: BranchOpRequest): Promise<{ ok: boolean; output?: string; error?: string }>;
  aiCommitMessage(request: AiCommitRequest): Promise<AiCommitResult>;
}