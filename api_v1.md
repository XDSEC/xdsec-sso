# XDSEC SSO API v1

本文档定义新 SSO 的账户接口、应用接入协议和生产迁移方案。接口处于设计阶段，路径和字段供前后端联调使用。

新 SSO 独立开发和部署测试。现网各系统继续使用自己的用户管理和认证流程。新 SSO 完成验收后，在同一个生产窗口导入账号、启用已验收的兼容适配并切换认证入口。周报和 Flarum 可以分别在测试环境联调。

## 1. 接口约定

- 账户中心页面和业务 API 同源部署，生产域名计划为 `https://account.xdsec.org`。业务 API 前缀为 `/api/v1`，下文业务接口表均省略该前缀。OIDC 客户端从服务发现文档获取协议端点。
- 有请求体的业务接口使用 `application/json`，字段使用 `camelCase`。时间戳使用 UTC RFC 3339，用户 `id` 是新 SSO 分配的稳定 UUID。账户接口和凭据响应使用 `Cache-Control: no-store`。
- 成功响应直接返回资源或操作结果。创建资源用 `201`，异步受理用 `202`，无需响应体用 `204`。错误采用 `application/problem+json`，`code` 是供客户端分支处理的稳定扩展字段。OIDC 端点使用协议规定的响应格式。 [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "rate_limited"
}
```

| HTTP 状态 | `code` 示例 | 含义 |
|---|---|---|
| `400` | `invalid_request`、`invalid_challenge` | 参数不符合约定，或提交的挑战无效、已过期或已使用 |
| `401` | `invalid_credentials`、`authentication_required` | 登录凭据错误，或缺少有效会话 |
| `403` | `forbidden`、`csrf_check_failed`、`reauthentication_required` | 权限不足，或需要完成相应验证 |
| `404` | `not_found` | 资源不存在或当前调用方不可见 |
| `409` | `user_conflict`、`invalid_user_state` | 唯一性约束或用户状态冲突 |
| `429` | `rate_limited` | 请求被限流，响应包含 `Retry-After` |

## 2. 用户、会话和登录

### 用户模型

账户 API 返回以下字段。`pendingActivation` 表示账号已创建、等待首次设密。`active` 表示账号已激活，可以登录。`suspended` 表示账号被封禁，解封会恢复封禁前的状态。管理员创建账号，关闭访客自行注册。服务端执行用户名和邮箱的唯一性校验，导入时采用同一归一化规则。用户角色以服务器当前记录为准。

```json
{
  "id": "2f6045f7-9797-4d8b-b93f-a9e86697acbb",
  "username": "xiaoming",
  "nickname": "小明",
  "email": "user@example.com",
  "emailVerified": true,
  "avatarUrl": null,
  "status": "active",
  "role": "member",
  "mfaMethods": ["totp"]
}
```

`role` 取 `member` 或 `admin`。密码哈希、TOTP 密钥、恢复码和会话凭据属于服务端内部数据。数据库结构由 migration 管理。

### 浏览器会话

- 账户中心设置 `__Host-sso_session`，属性为 `Secure; HttpOnly; SameSite=Lax; Path=/`，作用域限当前主机。Cookie 存放不透明会话标识，会话由服务端保存。页面通过 `GET /session` 读取当前会话状态和 CSRF token。
- 账户中心的业务写请求须校验 `Origin`，有请求体时使用 JSON。依赖会话 Cookie 鉴权的写请求还须提交 `X-CSRF-Token`，其值与当前会话绑定。身份验证完成时生成新会话标识，服务端执行空闲和绝对过期检查。 [OWASP 会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- 退出撤销当前 SSO 会话。封禁、密码重置撤销该用户的全部 SSO 会话，已签出的授权码也不得为封禁用户换发令牌。已签发令牌和下游本地会话的失效时限由接入契约定义，切换前逐应用验证。

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `POST /auth/login` | `{ identifier, password }`，`identifier` 接受用户名或邮箱 | `200`，`{ status: "authenticated" }` 并设置会话 Cookie；需要二次验证时返回 `{ status: "mfaRequired", challengeId, methods, expiresIn }` |
| `POST /auth/login/mfa` | `{ challengeId, method, code }`，`method` 取挑战返回的 `totp` 或 `recoveryCode`，`code` 为字符串 | `200`，`{ status: "authenticated" }` 并设置会话 Cookie |
| `GET /session` | 会话 Cookie | `200`，`{ user, expiresAt, csrfToken }`；没有有效会话时返回 `401` |
| `POST /auth/logout` | 会话 Cookie 和 CSRF token | `204`，撤销当前会话并清除 Cookie |

登录挑战短时有效，只用于完成本次登录，成功后原子消费，并限制尝试次数。客户端在内存中暂存 `challengeId`。用户名不存在、密码错误或账户不可登录时，密码登录接口返回统一的 `invalid_credentials`。登录和发邮件入口按来源及账号标识限流。

## 3. 激活、找回和账户管理

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `POST /auth/password-reset-requests` | `{ email }` | `202`，统一返回 `{ status: "accepted" }` |
| `POST /auth/password-resets` | `{ token, newPassword }` | `204`，首次设密激活账号；已有用户更新密码并撤销旧会话 |
| `GET /me` | 有效会话 | `200`，当前用户对象 |
| `PATCH /me` | `{ nickname }` | `200`，更新后的用户对象 |
| `POST /me/password-changes` | `{ newPassword }`，携带敏感操作凭据 | `204`，修改密码并撤销该用户的会话，页面引导重新登录 |

密码找回请求对存在和不存在的邮箱给出相同状态与响应体。邮件链接只打开设密页面，提交新密码时才消费凭据。凭据绑定账号和用途、短时有效，消费与密码更新在同一事务内完成。成功后由用户重新登录。密码哈希采用 Argon2id，服务端保存完整 PHC 字符串。

### 敏感操作验证

修改密码、修改邮箱、变更 MFA 凭据和高权限管理操作需要近期重新验证。根据操作和账户当前状态决定允许的方法。修改邮箱还需验证新邮箱的归属。已启用 TOTP 的用户恢复账号时，沿用经确认的恢复策略；迁移时明确需要重新绑定的用户范围。

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `POST /auth/reauthentication-challenges` | `{ action, targetId }`，无目标资源时省略 `targetId` | `201`，`{ challengeId, methods, expiresIn }` |
| `POST /auth/reauthentication-challenges/{challengeId}/verify` | `{ method, proof }` | `200`，`{ reauthToken, expiresIn }` |

后续敏感操作通过 `X-Reauth-Token` 提交短时一次性凭据。服务端将其绑定到当前会话、操作和目标，实际执行时再次检查权限。TOTP 启用、解绑和恢复码生成在联调前补齐请求字段和异常用例；若现网用户依赖 TOTP，这些流程纳入生产切换验收。Passkey 注册与登录、邮箱变更、头像上传和自助注销按后续功能补充契约，切换前确认各应用对这些功能的依赖。

## 4. 管理员接口

| 方法与路径 | 请求 | 成功响应 |
|---|---|---|
| `GET /admin/users` | `limit`、`cursor`、可选 `status` | `200`，`{ items, nextCursor }`，最后一页的 `nextCursor` 为 `null` |
| `POST /admin/users` | `{ username, email, nickname }` | `201`，创建待激活账户并返回用户对象，安排发送设密邮件 |
| `PUT /admin/users/{id}/suspension` | `{ reason }`，携带敏感操作凭据 | `204`，封禁并撤销会话 |
| `DELETE /admin/users/{id}/suspension` | 携带敏感操作凭据 | `204`，解除封禁 |

列表默认每页 20 条，最多 100 条，使用稳定排序和不透明游标。首个管理员通过部署侧初始化。批量导入、管理员角色变更预留独立契约；生产迁移由部署侧导入工具执行。管理操作的审计记录包括操作者 ID、目标 ID、动作、结果和时间。认证材料和完整凭据不写入日志。

## 5. 应用接入与旧系统兼容

### 新应用接入

新应用使用 OIDC Authorization Code Flow + PKCE（`S256`）。为每个应用登记 `client_id`、精确匹配的 `redirect_uri` 和允许的 scopes。授权请求如需登录，由服务端保留短时授权事务，认证完成后恢复该事务，再回调登记的客户端。客户端按协议校验 `state`、`nonce`、签名、签发方、受众和有效期，随后建立自己的会话。应用以 `(iss, sub)` 作为外部身份键，按需取得经授权的资料。Provider 实现待选定，服务发现、令牌和签名密钥端点以 Provider 配置为准。 [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) · [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)

每个接入方在上线前确认三件事：应用本地退出的行为、SSO 退出对应用会话的影响，以及管理员封禁后用户还可以访问多久。需要跨应用注销时，核对 Provider 和客户端对相应机制的支持并实测。

### 周报与 Flarum

| 应用 | 兼容方案 | 切换验收 |
|---|---|---|
| 周报 | 对仍依赖 `X-Email` 的版本，由支持 OIDC 的代理建立会话，由可信代理覆盖身份头。周报上游仅接受可信代理访问。 | 验证登录回跳、旧账号匹配、历史周报归属、退出和封禁后的访问行为。 |
| Flarum | 先验证现网版本与 OIDC 扩展的兼容性。若需要沿用现有 JWT 插件，为论坛提供独立适配，限定签发方、论坛受众和有效期，由论坛侧建立本地会话。具体路径和字段以现网插件实测为准。 | 验证已有账号绑定、首次进入、帖子归属、角色和退出。旧账号按确认后的迁移映射关联。 |

兼容适配按应用独立配置和验收。旧应用直接支持标准接入后，可以下线对应适配。

## 6. 一次性生产迁移

### 切换前

1. 盘点所有待切换的应用、各自的用户库、身份标识、角色及状态、凭据类型和业务数据外键。建立 `(旧系统, 旧用户 ID) → 新 SSO 用户 ID` 的映射。邮箱和用户名用于辅助核对，冲突与无法匹配的记录逐项确认。
2. 用脱敏数据验证导入，检查数量、唯一性、封禁状态和权限，保留论坛与周报需要的本地用户 ID 和业务数据归属。验证哪些密码和 MFA 凭据可迁移，为需要重设的用户准备激活或重新绑定流程。
3. 演练全量导入、重复执行和回滚。逐应用验证标准接入或兼容链路，覆盖正常登录、MFA、已有账号关联、被封禁、退出、历史数据可见性。测试环境使用独立的域名、凭据和数据库。

### 切换窗口

1. 备份旧账号数据和应用认证配置。冻结旧系统的账号变更，或按演练方案执行最终增量同步，确定导入数据的截止点。
2. 导入最终数据并核对账号映射、角色、封禁状态和冲突清单。启用已验收的兼容适配，在同一窗口切换各应用认证配置。明确旧会话如何失效、用户何时需要重新登录。
3. 逐应用核验登录、权限和历史数据归属，再开放正常流量。账号错绑、权限异常或关键应用登录失败时，按演练方案回滚认证配置。记录切换后在新 SSO 产生的改密、封禁和新建账号事件，按预定规则核对和处理后再解除旧系统的写入限制。

上线门槛是**计划迁移的应用全部通过验收、账号映射无未处理冲突、迁移和回滚均已演练**。
