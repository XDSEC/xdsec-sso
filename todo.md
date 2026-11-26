# XDSEC SSO 开发待办

以 [API v1](api_v1.md) 为准。先跑通新版后端并在测试环境验收周报和 Flarum，全部确认无误后再统一迁移上线；前端基于 MSW Mock 先行独立推进，待后端就绪后逐项联调。

## P0 · 跑通后端核心能力

- [ ] 补齐配置加载与基础框架：接入 SeaORM（线上复用 MySQL）、轻量 Redis 与 Axum，对齐 `/api/v1` 前缀和统一报错格式。 [基础约定](api_v1.md#1-基础约定)
- [ ] 完成数据库建表与首个管理员初始化入口，覆盖用户、TOTP 与恢复码、邮件 Token 及审计日志。 [用户对象](api_v1.md#21-用户对象user)
- [ ] 实现登录、MFA 二步验证、Redis 会话管理、防 CSRF 校验，以及封禁或改密后一键清空全端会话。 [登录与会话接口](api_v1.md#31-登录与会话接口)
- [ ] 实现新成员三步激活（设密、绑首个 TOTP、生成恢复码）与老用户找回密码流程，区分两类邮件链接和 Token 用途。 [激活与找回密码](api_v1.md#41-激活找回密码和恢复码规则)
- [ ] 接入 GCRA 限流，保护登录、MFA 校验和发邮件入口。 [GCRA 实现](crates/server/src/utils/rate_limit.rs)
- [ ] 内置实现核心 OIDC 接口（Authorization Code + PKCE）和同源登录回跳流程，并用测试客户端跑通。 [新应用接入](api_v1.md#61-新应用怎么接oidc)

## P1 · 个人中心、后台管理与旧应用验收

- [ ] 实现 5 分钟 Sudo 验证与统一拦截中间件，只接受 MFA 验证，不给纯密码兜底。 [Sudo 模式](api_v1.md#32-敏感操作验证sudo-模式)
- [ ] 实现个人资料修改、改密码、TOTP 绑定/覆盖换绑/解绑（禁止删光最后一个 MFA）及重刷恢复码。 [个人中心与 MFA](api_v1.md#42-个人中心与-mfa-管理接口)
- [ ] 实现管理员用户分页查询、建号、封禁/解封、重置他人 MFA 及操作审计日志。 [管理员接口](api_v1.md#5-管理员接口)
- [ ] 在测试环境用 Nginx `auth_request` 接通周报系统，验证登录回跳、历史周报归属以及退出和封禁拦截。 [旧系统兼容](api_v1.md#62-两个老系统怎么兼容周报和-flarum)
- [ ] 在测试环境实测 Flarum 论坛接入（优先开源 OIDC 插件，不行则做短有效期 JWT 适配），验证发帖归属、角色和退出行为。 [旧系统兼容](api_v1.md#62-两个老系统怎么兼容周报和-flarum)

## P2 · 演练迁移并统一切换

- [ ] 核对旧系统（Kratos、周报、Flarum）用户数据，建立 UUID 映射并处理重名或邮箱冲突。 [切换前](api_v1.md#切换前测试环境先练一遍)
- [ ] 在测试环境用脱敏数据演练全量导入、重复导入和回滚预案。 [切换前](api_v1.md#切换前测试环境先练一遍)
- [ ] 备份旧数据并停写，正式导入后统一切换周报与论坛入口，抽测无误再放开访问。 [切换当天](api_v1.md#切换当天正式上线)

## 前端 P0 · 工程底座与核心认证流

- [x] 初始化 `web/` 前端工程底座（Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + Biome + Vitest）与 Agent 规范文档。
- [ ] 搭建前端基础管道：对齐 `api_v1.md` 定义全局 TS 类型、统一 `fetch` 客户端（内存 `X-CSRF-Token`、RFC 9457 错误解析、`429 Retry-After`、Sudo 拦截钩子）、`returnTo` 同源校验函数（附单测）及 MSW 本地 Mock 桩。 [基础约定](api_v1.md#1-基础约定) · [登录回跳](api_v1.md#63-登录回跳参数约定returnto)
- [ ] 实现登录与 MFA 二步验证页（`/login`）：支持密码登录、TOTP/恢复码校验、老成员未绑 MFA 提示框，以及验证通过后 `window.location.assign(returnTo)` 整页回跳。 [登录与会话接口](api_v1.md#31-登录与会话接口)
- [ ] 实现新成员三步激活页（`/activate`）：串联设初始密码、本地渲染 `otpauthUri` 扫码绑 TOTP、展示一次性恢复码（复制/下载 `.txt` + 强制勾选已保存闭环）。 [激活规则](api_v1.md#41-激活找回密码和恢复码规则)
- [ ] 实现忘记密码与重置密码页（`/forgot-password`、`/reset-password`），确保邮件落地页加载时不预消费 Token。 [忘记与重置密码](api_v1.md#忘记密码与重置密码reset-passwordtokenrst_)

## 前端 P1 · 个人中心、Sudo 弹窗与管理后台

- [ ] 实现全局 Sudo 5 分钟验证弹窗：拦截 `403 reauthentication_required` 自动唤起 TOTP/恢复码重认证，通过后衔接原操作；处理 `403 mfa_required` 引导补绑。 [Sudo 模式](api_v1.md#32-敏感操作验证sudo-模式)
- [ ] 实现个人中心（`/settings`）：支持修改昵称、改密后重登、TOTP 首次补绑（验当前密码）/ 覆盖换绑（走 Sudo）与重刷恢复码，禁止解绑最后一个 MFA。 [个人中心与 MFA](api_v1.md#42-个人中心与-mfa-管理接口)
- [ ] 实现管理员后台（`/admin/users`）：支持用户分页筛选与关键词搜索、新建待激活账号，以及封禁/解封/重置他人 MFA（接入 Sudo 验证）。 [管理员接口](api_v1.md#5-管理员接口)
- [ ] 关闭 MSW Mock 与后端测试环境实测联调，完成 Cookie、CSRF、Sudo 与下游系统 `returnTo` 回跳全链路验收。

## 后续迭代

- [ ] 后续版本再加 Passkey、改邮箱、换头像、注销账号与管理端批量导入。
