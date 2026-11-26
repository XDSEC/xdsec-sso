# XDSEC SSO Agent 开发规范

本文档定义 AI Agent 在 `xdsec-sso` 仓库内工作的全局边界、契约来源与协作纪律。

## 1. 仓库结构与修改边界

- `crates/`：Rust 后端（`axum` + `sea-orm` + `redis`），主要由后端开发者手写维护。
- `web/`：React 单页前端应用，具体前端架构与安全红线必须同时遵守 [web/AGENTS.md](web/AGENTS.md)。
- `deploy/`：Docker Compose、Nginx 与环境配置。
- `api_v1.md`：**前后端唯一生效的接口契约（Single Source of Truth）**。根目录下的 `api.md` 为早期历史草稿，开发时严禁参考 `api.md`。
- `todo.md`：前后端开发里程碑与验收待办清单。

**跨端隔离原则**：
- 执行前端开发任务时，**未经用户明确要求，严禁修改 `crates/`、`Cargo.toml`、`Cargo.lock` 或 `rustfmt.toml`**。
- 执行后端开发任务时，未经明确要求不改动 `web/` 代码。

## 2. 接口与安全契约铁律

1. **严禁脑补接口**：所有接口路径（统一前缀 `/api/v1`）、JSON 字段名（统一 `camelCase`）、时间格式（UTC RFC 3339）、HTTP 状态码及 RFC 9457 错误码（`application/problem+json` 的 `code` 字段）必须严格对齐 [api_v1.md](api_v1.md)。
2. **契约变更先确认**：若发现 `api_v1.md` 存在未覆盖场景或前后矛盾，必须先停下来向开发者指出并确认方案，禁止私自偏离文档实现。
3. **敏感信息保护**：密码明文/哈希、Session ID、CSRF Token、TOTP 密钥、激活/重置邮件 Token 及恢复码严禁打印至持久化日志或提交进代码库。

## 3. Git 提交与分支规范（对齐 `CONTRIBUTING.md`）

1. **Commit 消息格式**：
   - 必须使用 **gitmoji 的 Markdown 代码格式**（如 `:sparkles:`、`:bug:`、`:memo:`、`:recycle:`、`:white_check_mark:`），**严禁直接使用 `✨` 等 Unicode 表情符号**。
   - 首行使用英文，**首字母小写**，简明描述核心改动而非罗列文件名（例：`:sparkles: frontend: add login and mfa form`）。
   - 回退历史提交优先使用 `git revert`，禁止对共享分支执行破坏性重写。
2. **分支管理**：
   - `main`：生产环境分支（严禁直接推送代码）。
   - `develop`：开发集成分支（阶段性完成后通过 PR 合入 `develop`）。
   - `dev/backend` / `dev/frontend`：前后端各自日常推进分支。
3. **代码注释与格式化**：
   - 前后端关键业务逻辑注释统一使用**中文**。
   - 后端提交前需通过 `cargo +nightly fmt` 及对应单元测试；前端提交前需通过 `web/AGENTS.md` 规定的全部检查命令。
