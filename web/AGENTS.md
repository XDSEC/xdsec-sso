# XDSEC SSO 前端（`web/`）Agent 施工规范

在 `web/` 目录下进行任何开发、重构或测试时，除遵守根目录 [AGENTS.md](../AGENTS.md) 外，必须严格执行本规范。

## 1. 固定技术栈（禁止私自引入替代方案）

- **构建与框架**：Vite 8 + React 19 + TypeScript 7（开启 `strict` 与 `noUncheckedIndexedAccess`）
- **样式与 UI**：Tailwind CSS v4 + `shadcn/ui`（`new-york` 风格，按需通过 `pnpm dlx shadcn@latest add <component>` 安装至 `src/components/ui/`）+ `lucide-react`
- **路由**：`react-router`（SPA 模式）
- **请求与状态**：统一原生 `fetch` 封装 + `@tanstack/react-query`（不额外引入 Redux / Zustand 等全局状态库，除非确有必要并经确认）
- **表单与校验**：`react-hook-form` + `zod` + `@hookform/resolvers`
- **二维码渲染**：`qrcode.react`（用于前端本地渲染 `otpauthUri`）
- **代码检查与格式化**：`@biomejs/biome`（禁止引入 ESLint 或 Prettier）
- **测试与接口模拟**：`vitest` + `@testing-library/react` + `msw`（Mock Service Worker）

## 2. 标准命令与交付门槛

所有命令均在 `web/` 目录下执行：

- `pnpm dev`：启动本地开发服务器
- `pnpm check`：运行 Biome 格式、Import 排序与静态规则检查
- `pnpm check:write`：自动修复格式与可自动处理的 Biome 规则项
- `pnpm typecheck`：仅运行 `tsc -b` 类型检查
- `pnpm build`：运行 `tsc -b && vite build` 严格编译打包
- `pnpm test`：运行 `vitest run` 执行全部单元测试

**交付硬门槛**：每次完成代码修改后，**必须依次运行 `pnpm check`、`pnpm build`、`pnpm test` 且全部零报错通过**，禁止跳过检查或通过放宽规则蒙混过关。

## 3. 目录职责与演进原则

**核心原则：按需建文件，严禁提前创建空目录或预设未使用的业务文件。**

```text
web/src/
├── api/            # 对齐 api_v1.md 的 TS 类型定义与唯一 fetch 请求客户端
├── components/
│   └── ui/         # shadcn/ui 生成的基础组件（保持纯粹，不混入业务耦合逻辑）
├── features/       # 按业务域内聚（auth / activation / settings / admin），开发到对应模块时按需创建
├── pages/          # 路由页面薄入口，对齐 URL 路由表
├── lib/            # 纯工具函数（如 cn 样式合并、returnTo 安全校验）
├── mocks/          # MSW handlers 与测试桩数据（供后端未就绪时前端独立开发及单测复用）
└── test/           # Vitest 全局测试初始化配置
```

### 前端路由对齐表

- `/login`：登录与 MFA 二步验证（接收可选 `?returnTo=...`）
- `/activate`：新成员三步激活（接收邮件参数 `?token=act_...`）
- `/forgot-password`：发起找回密码 / 重发激活邮件
- `/reset-password`：老用户凭邮件参数 `?token=rst_...` 重置密码
- `/settings`（及首页 `/` 重定向）：个人中心与 MFA 管理
- `/admin/users`：管理员用户管理后台（需校验 `user.role === "admin"`）

## 4. 安全与认证业务红线（严格对应 `api_v1.md`）

1. **敏感凭据仅存内存**：
   - `csrfToken`（来自 `GET /session`）、登录挑战 `challengeId`、新成员激活凭据 `activationToken` 以及一次性明文 `recoveryCodes` **严禁写入 `localStorage`、`sessionStorage`、Cookie 或拼接到 URL**，仅限存放在内存变量/React 状态中。
2. **禁止在组件中裸写 `fetch`**：
   - 所有后端调用必须经过 `src/api/` 统一请求封装：固定同源携带 Cookie（`credentials: "same-origin"`），已登录态下的写请求（`POST` / `PUT` / `PATCH` / `DELETE`）自动注入 `X-CSRF-Token` 请求头。
3. **`returnTo` 防开放重定向与整页回跳（`api_v1.md` §6.3）**：
   - 读取 `returnTo` 时必须走统一安全校验函数，**同时满足以下三条才视为合法**，否则直接丢弃并回退至默认页：
     1. 以单个正斜杠 `/` 开头；
     2. 第 2 个字符不是 `/` 且不是 `\`（拦截 `//evil.com`、`/\evil.com`）；
     3. `new URL(returnTo, window.location.origin).origin === window.location.origin`，且路径不指向 `/login` 自身。
   - 进入 MFA 第二步或关闭“建议开启 MFA”提示框时，不得丢失已校验合法的 `returnTo`。
   - 登录及 MFA 校验全部完成后，若存在合法 `returnTo`，**必须调用 `window.location.assign(returnTo)` 触发浏览器整页导航交还后端**（确保携带 `__Host-sso_session` 请求后端 `/authorize` 或老系统回调入口），**严禁使用 `react-router` 的 `navigate()` 跳转 `returnTo`**。
4. **全局错误码与 Sudo 重认证拦截（`api_v1.md` §1.3 & §3.2）**：
   - 统一解析 `application/problem+json` 的 `code` 与 `detail`：
     - `401 authentication_required`：清空前端登录态并跳往 `/login`；
     - `403 reauthentication_required`：唤起全局 Sudo 验证弹窗（调用 `POST /auth/sudo` 校验 TOTP 或恢复码，**绝不提供纯密码选项**），验证成功后继续/重发原操作；
     - `403 mfa_required`：提示并引导未绑定 MFA 的老成员先前往绑定首个 MFA；
     - `429 rate_limited`：读取响应头 `Retry-After`（秒），对触发限流的提交按钮展示倒计时禁用。
5. **激活、MFA 与防邮件预加载铁律（`api_v1.md` §4.1 & §4.2）**：
   - **防邮件客户端预加载误消费**：`/activate` 与 `/reset-password` 页面挂载时**严禁自动请求后端消费邮件 `token`**，只能在用户点击提交表单时发起 `POST` 请求。
   - **恢复码强制闭环**：首次绑定 MFA（`0 -> 1`）返回明文 `recoveryCodes` 时，必须提供“复制 / 下载 `.txt`”功能，并在新成员激活第 3 步强制要求勾选 **“我已妥善保存恢复码”** 后才允许点击完成。
   - **禁止删光最后一个 MFA**：更换手机走 `setup -> verify` 覆盖换绑；当 `user.mfaMethods.length <= 1` 时，界面禁止引导或暴露“解绑最后一个 MFA”按钮。

## 5. 代码质量与单元测试规范

- **严禁 `any`**：`biome.json` 已将 `noExplicitAny` 设为 `error`，所有 API 请求体、响应体与错误结构均需定义严格 TypeScript 类型。
- **注释规范**：复杂状态流转与安全校验逻辑使用简洁的**中文注释**说明意图。
- **单元测试重点**：
  - 必测纯安全工具与请求管道（如 `returnTo` 边界用例、CSRF 头注入、Sudo `403` 拦截、`429 Retry-After` 解析）。
  - 必测核心多步认证状态机（如登录切 MFA 步、三步激活未勾选保存恢复码时禁用完成按钮）。
  - 不为纯静态排版或 `shadcn/ui` 原生内部行为编写冗余测试。
