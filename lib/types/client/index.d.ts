/** Git 版本控制插件客户端类型定义 */

export interface GitViewProps {
  workspacePath: string;
  viewRequest: any;
  openView: (view: string, focus: string) => void;
  completeViewRequest: () => void;
  renderSlot: (name: string, props: any) => any;
  t: (key: string) => string;
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "dsh-git": Record<string, string>;
  }
}

declare module "dsh-git/client" {
  export const apply: (ctx: import("@deepseek-ai/cordis").Context) => void;
  export const inject: string[];
}