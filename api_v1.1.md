# XDSEC SSO API v1.1 接口文档

这份文档用于前后端联调，约定新版 XDSEC 统一登录系统（`https://account.xdsec.org`）的接口格式、登录安全规则、应用接入方式和上线步骤。所有业务接口统一以 `/api/v1` 开头（下面写路径时省略这个前缀）。

新系统会先在测试环境开发并把论坛、周报逐个联调通，全部没问题后，再挑一个空闲时间把老账号导过来、统一切换登录入口。

---

## 1. 基础约定

### 1.1 部署与存储
- **前后端同域名**：页面和后端接口都挂在 `https://account.xdsec.org` 下。
- **复用现有 MySQL + 保留轻量 Redis**：后端通过 SeaORM 兼容 MySQL / PostgreSQL / SQLite（线下开发可用 Docker 跑 PG，线上直接连服务器现成的 **MySQL** 新建独立库，不再单独起 PostgreSQL 容器）；同时保留轻量 **Redis** 统一管理所有带过期时间（TTL）的会话和临时凭据（部署时配置 `maxmemory` 内存上限兜底）。
  - **存数据库（MySQL）**：用户资料、密码哈希、MFA 密钥与恢复码、改密/激活链接 Token、管理员操作日志。
  - **存 Redis（TTL 自动过期）**：普通登录 Session、5 分钟 Sudo 状态、短时 MFA 登录挑战、OIDC 授权码、接口限流计数（按用户维护会话索引，支持改密/封禁时一键清空全部设备会话）。

### 1.2 请求和返回格式
- 请求和返回都用 JSON（`application/json`），字段名统一用小驼峰（`camelCase`）。
- 所有时间统一用 UTC RFC 3339 字符串（比如 `2026-11-26T08:00:00Z`）。
- 用户 `id` 是后端生成的 UUID，创建后永不变动。
- 返回用户信息或登录凭据的接口，响应头都要加上 `Cache-Control: no-store`，防止被浏览器或代理缓存。
- **成功状态码**：
  - `200`：查询或操作成功，直接返回结果 JSON（外面不再套一层 `{ data: ... }`）。
  - `201`：新建资源成功。
  - `202`：请求已受理（比如后台正在发邮件）。
  - `204`：操作成功，没有返回体。

### 1.3 报错格式
接口报错统一返回 `application/problem+json`（[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)），前端直接拿 `code` 做分支判断和中文提示：

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "rate_limited",
  "detail": "请求太频繁，请稍后再试"
}
```

| 状态码 | `code` | 什么意思 / 前端怎么处理 |
|---|---|---|
| `400` | `invalid_request` | 参数格式不对，或者没通过校验 |
| `400` | `invalid_challenge` | MFA 挑战码、激活/重置链接不对、过期了，或者已经用过了 |
| `401` | `invalid_credentials` | 账号密码不对，或者账号不能登录（登录失败都统一返这个，防猜账号） |
| `401` | `authentication_required` | 没登录，或者登录过期了，跳去登录页 |
| `403` | `forbidden` | 权限不够（比如普通成员调了 `/admin/*`） |
| `403` | `csrf_check_failed` | `Origin` 或 `X-CSRF-Token` 校验没过 |
| `403` | `reauthentication_required` | 需要过一遍 Sudo 验证，弹窗让用户输 2FA 或按 Passkey |
| `403` | `mfa_required` | 这账号还没绑任何 MFA，不能做敏感操作，引导去绑定 |
| `404` | `not_found` | 找不到对应的资源 |
| `409` | `user_conflict` | 用户名或邮箱已经被占用了 |
| `409` | `invalid_user_state` | 当前账号状态不允许做这个操作（比如重复封禁） |
| `429` | `rate_limited` | 被限流了，读响应头里的 `Retry-After`（单位秒）给按钮做倒计时 |

---

## 2. 用户数据与登录态安全

### 2.1 用户对象（`User`）
本系统**不开放自行注册**，账号只能由管理员新建或从老系统导入。用户名和邮箱在存库前统一去空格、转小写，并保证全站唯一。

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

- `status`（账号状态）：
  - `pendingActivation`：刚建好，等用户点邮件链接设密码并激活。
  - `active`：正常账号。
  - `suspended`：被管理员封禁了（解封后恢复成封禁前的状态）。
- `role`（角色）：`member`（普通成员）或 `admin`（管理员）。
- `mfaMethods`：用户当前已经绑好的 MFA 方式，比如 `[]`、`["totp"]`、`["totp", "passkey"]`。
- 密码用 **Argon2id** 存完整 PHC 哈希串；密码哈希、TOTP 密钥、恢复码这些机密字段只在后端保存，绝不发给前端。

### 2.2 Cookie、CSRF 和限流
- **Session Cookie**：登录成功后，后端生成一个随机字符串作为 Session ID，放进 Cookie `__Host-sso_session`，属性固定为 `Secure; HttpOnly; SameSite=Lax; Path=/`。
- **什么时候会踢下线**：
  - 会话有“长时间不动自动过期”和“最长有效期”两道限制；每次重新登录都会换全新的 Session ID。
  - 点退出登录：只注销当前这台设备的会话。
  - **账号被封禁、修改密码、重置密码、或被管理员重置 MFA**：立刻清空该用户在**所有设备**上的会话（手里没来得及换令牌的 OIDC 授权码也一起作废）。
- **防 CSRF**：
  - 所有改数据的请求（`POST` / `PUT` / `PATCH` / `DELETE`）都会检查 `Origin` 请求头。
  - 登录后才能调的写接口，前端必须额外带上请求头 `X-CSRF-Token`（值从 `GET /session` 拿到后存在前端内存里）。
- **限流**：密码登录、MFA 校验、发找回密码邮件这几个入口，按 IP 和账号做 GCRA 限流，超了直接返回 `429` + `Retry-After`。

---

## 3. 登录、会话与敏感操作（Sudo 模式）

### 3.1 登录与会话接口

| 接口 | 说明 |
|---|---|
| `POST /auth/login` | 用户名或邮箱 + 密码登录 |
| `POST /auth/login/mfa` | 登录第二步：提交 TOTP 或恢复码 |
| `GET /session` | 查当前登录的用户信息、Sudo 状态和 CSRF Token |
| `POST /auth/logout` | 退出当前登录并清掉 Cookie |

#### `POST /auth/login`
- 请求体：
  ```json
  {
    "identifier": "xiaoming",
    "password": "your-password"
  }
  ```
  `identifier` 同时支持用户名或邮箱。只要账号不存在、密码错或被封了，一律返回 `401 (invalid_credentials)`。
- 如果账号没开 MFA，直接登录成功（返回 `200`， 写入ession Cookie）：
  ```json
  {
    "status": "authenticated"
  }
  ```
- 如果账号开了 MFA，返回 `200`，前端切到第二步验证码界面：
  ```json
  {
    "status": "mfaRequired",
    "challengeId": "chg_01J...",
    "methods": ["totp", "recoveryCode"],
    "expiresIn": 300
  }
  ```
  `challengeId` 几分钟过期、输错太多次也会作废。前端放内存里就行，验过一次马上销毁。

#### `POST /auth/login/mfa`
- 请求体：
  ```json
  {
    "challengeId": "chg_01J...",
    "method": "totp",
    "code": "482910"
  }
  ```
  `method` 填 `totp` 或 `recoveryCode`（以后加 Passkey 登录时再单加接口）。
- 验证通过返回 `200` 并写入 Session Cookie：
  ```json
  {
    "status": "authenticated"
  }
  ```

#### `GET /session`
- 直接带 Cookie 调；没登录或过期返回 `401 (authentication_required)`。
- 返回 `200`：
  ```json
  {
    "user": { "...": "User 对象" },
    "expiresAt": "2026-12-03T08:00:00Z",
    "sudoExpiresAt": null,
    "csrfToken": "csrf_..."
  }
  ```
  `sudoExpiresAt` 是 Sudo 模式的到期时间；没开启或已过期就是 `null`。

#### `POST /auth/logout`
- 需要登录 Cookie + `X-CSRF-Token`。
- 返回 `204`，删掉服务端当前会话并清掉 Cookie。

---

### 3.2 敏感操作验证（Sudo 模式）

改密码、解绑 MFA、管理员封号/解封/重置他人 MFA 这些高危操作，要求最近刚刚重新验过一次强身份。

我们用类似 GitHub 的 **Sudo 模式**：
1. 后端通过 Redis 为当前 Session 维护 **5 分钟**有效的 Sudo 状态（利用 TTL 自动过期，并在 `GET /session` 中返回 `sudoExpiresAt`）。**`POST /auth/sudo` 绝不接受纯密码**。
2. 所有敏感接口本身不用多传验证字段，统一套一个 `require_sudo` 中间件拦在门口：
   - **账号还没绑任何 MFA**：直接拦下，返回 `403 (mfa_required)`，不给纯密码兜底，前端引导先去绑定 MFA。
   - **绑了 MFA，但 Sudo 没开或过期了**：返回 `403 (reauthentication_required)`，前端弹出验证框过一遍 Sudo，通过后自动重发刚才那个请求。
   - **正在 5 分钟 Sudo 有效期内**：直接放行。
3. **Passkey 免输 2FA**：Passkey 本身安全性更高，无论是登录还是过 Sudo，只要按 Passkey 验过了就直接放行，不用再输 6 位 TOTP 码。
4. **老成员首次绑 MFA 的特殊处理（防死循环，也不给 Sudo 窗口）**：
   - 如果老成员名下还没有任何 MFA（`mfaMethods` 是空的），调“首次绑定 MFA”接口时**不检查 Sudo，也不会顺手给 5 分钟 Sudo 窗口**。
   - 只需要在这次绑定请求里带上 `currentPassword` 当场验一下密码（用完即止）；绑完第一个 MFA 之后，所有敏感操作就一律严格走 MFA / Passkey Sudo。
5. **登录后提醒绑 MFA**：老成员登录成功后，如果前端发现 `user.mfaMethods` 是空的，先弹一个“建议开启 MFA”的提示框，让用户选“现在去配”或者直接关掉弹窗。

#### `POST /auth/sudo`（用 TOTP 或恢复码进入 Sudo）
- 需要登录 Cookie + `X-CSRF-Token`。
- 请求体：
  ```json
  {
    "method": "totp",
    "code": "482910"
  }
  ```
  `method` 填 `totp` 或 `recoveryCode`。
- 返回 `200`：
  ```json
  {
    "sudoExpiresAt": "2026-11-26T08:05:00Z"
  }
  ```

> **后续加 Passkey 怎么接**：以后加 Passkey 时，只需要在旁边多写一对 `POST /auth/sudo/passkey/start`和 `POST /auth/sudo/passkey/finish`。已经写好的业务接口和 `require_sudo` 中间件无需修改。

---

## 4. 激活账号、找回密码与个人中心

| 接口 | 权限要求 | 说明 |
|---|---|---|
| `POST /auth/password-reset-requests` | 无需登录 | 忘记密码，请求发一封重置邮件 |
| `POST /auth/password-resets` | 无需登录 | 拿邮件里的 Token 设初始密码或重置密码 |
| `GET /me` | 已登录 | 看自己的资料 |
| `PATCH /me` | 已登录 + CSRF | 改自己的昵称 |
| `POST /me/password-changes` | 已登录 + CSRF + **Sudo** | 改自己的密码 |

### 4.1 激活、找回密码和恢复码规则
- **`POST /auth/password-reset-requests`**
  - 请求体：`{ "email": "user@example.com" }`
  - 无论邮箱是否存在，统一返回 `202` 和 `{ "status": "accepted" }`。
- **`POST /auth/password-resets`**
  - 请求体：`{ "token": "rst_...", "newPassword": "new-strong-password" }`
  - 找回密码成功返回 `204`；如果是新成员首次激活，则继续走下一步绑定 MFA（具体字段等补齐 MFA 接口时一起定）。
  - 注意三点：
    - 点邮件链接只是打开前端网页，真正点“提交新密码”时才让 Token 失效（防止邮箱客户端自动预加载把链接点废了）。
    - 销毁 Token 和改密码必须放在**同一个数据库事务**里完成（要么全成，要么全回滚），提交后立即清空该用户在 Redis 里的全部旧会话。
    - 老用户重置完密码后旧登录态全失效，前端跳回登录页让用户用新密码重登。
- **新老成员的 MFA 策略分开**：
  - **新成员（`pendingActivation`）**：激活必须走完 **“设初始密码 → 绑首个 MFA（首期 TOTP，以后也支持 Passkey）→ 确认保存恢复码”** 这三步，账号才会变成 `active`，保证新成员 100% 开 MFA。
  - **迁移过来的老成员**：不卡正常登录看周报和论坛，靠登录后的弹窗提示 + 做敏感操作时返回 `403 (mfa_required)` 提醒他们尽快补绑。
- **恢复码（Recovery Codes）**：
  - **只有当账号从 `0 个 MFA` 变成 `1 个 MFA`（绑完第一个 MFA）时**，后端才自动生成一套一次性恢复码。后端只存哈希，明文只在这次接口返回**唯一一次**。
  - 前端把恢复码展示出来，提供“复制 / 下载 `.txt`”按钮，必须勾选 **“我已妥善保存恢复码”** 才能点完成。
  - 以后再加第 2 个、第 3 个 MFA（比如绑了 TOTP 又加了个 Passkey）时不用重新发恢复码；用户随时可以去个人中心过一遍 Sudo 手动重刷一批新的（旧的立刻作废）。

### 4.2 个人中心接口
- **`GET /me`**：返回 `200` 和当前用户的 `User` 对象。
- **`PATCH /me`**：传 `{ "nickname": "新昵称" }`，返回 `200` 和改完后的 `User` 对象。
- **`POST /me/password-changes`**（需 Sudo）：传 `{ "newPassword": "new-strong-password" }`，返回 `204`，同时踢掉所有设备的旧会话，前端跳去重新登录。

> **待补齐接口**：TOTP 绑定（生成二维码、提交 6 位码确认并返回恢复码）、解绑、重刷恢复码的具体路径和字段在联调前补齐；Passkey 登录/注册、改邮箱、换头像、注销账号留到后续版本再加。

---

## 5. 管理员接口

所有 `/admin/*` 接口只有 `role === "admin"` 能调（其他人一律 `403 forbidden`），改数据的接口都要带 `X-CSRF-Token`。第一个管理员在部署时用命令行或脚本初始化。

| 接口 | 额外要求 | 说明 |
|---|---|---|
| `GET /admin/users` | - | 分页查用户列表 |
| `POST /admin/users` | CSRF | 新建待激活账号，后台发设密邮件 |
| `PUT /admin/users/{id}/suspension` | CSRF + **Sudo** | 封禁账号并踢掉所有登录态 |
| `DELETE /admin/users/{id}/suspension` | CSRF + **Sudo** | 解封账号 |
| `DELETE /admin/users/{id}/mfa` | CSRF + **Sudo** | 清空某人的全部 MFA 和恢复码（救命兜底用） |

### 5.1 接口详情

#### `GET /admin/users`（常规页码分页）
- Query 参数：
  - `page`：第几页，默认 `1`。
  - `pageSize`：每页几条，默认 `20`，最多 `100`。
  - `status`（可选）：按状态筛，`pendingActivation` | `active` | `suspended`。
  - `keyword`（可选）：按用户名、昵称或邮箱模糊搜。
- 返回 `200`：
  ```json
  {
    "items": [ { "...": "User 对象" } ],
    "total": 685,
    "page": 1,
    "pageSize": 20
  }
  ```

#### `POST /admin/users`
- 请求体：`{ "username": "xiaoming", "email": "user@example.com", "nickname": "小明" }`
- 返回 `201` 和新建的 `User` 对象（`status` 为 `pendingActivation`），后台发激活设密邮件。重名或邮箱重复返回 `409 (user_conflict)`。

#### `PUT /admin/users/{id}/suspension`（需 Sudo）
- 请求体：`{ "reason": "封禁原因" }`
- 返回 `204`，把账号设为 `suspended`，并立刻踢掉该用户在所有设备上的会话。

#### `DELETE /admin/users/{id}/suspension`（需 Sudo）
- 返回 `204`，把账号恢复成封禁前的状态。

#### `DELETE /admin/users/{id}/mfa`（需 Sudo）
- 请求体（可选）：`{ "reason": "换手机且恢复码丢失，已核实本人" }`
- 返回 `204`。清空该用户的所有 MFA（TOTP / Passkey）和恢复码，并踢掉其全部现有会话；对方重新登录后可以重走首次绑定 MFA。

### 5.2 操作日志（审计）
建号、封号、解封、重置 MFA 这些管理操作都要记日志，写清楚：**谁操作的（操作者 ID）、操作了谁（目标 ID）、做了什么操作、是否成功、操作时间**。密码、Token、TOTP 密钥这类敏感信息绝对不能打进日志。

---

## 6. 应用接入与老系统兼容

### 6.1 新应用怎么接（OIDC）
以后新写的应用，统一走标准 **OIDC Authorization Code + PKCE（`S256`）**：
- **不用另起第三方 OIDC 服务**：直接由 `xdsec-sso` 自己实现核心的几个 OIDC 接口（发现文档 `/.well-known/openid-configuration`、`/authorize`、`/token`、`/userinfo` 和 JWKS）。
- 每个接入方在 SSO 里登记自己的 `client_id`、精确匹配的 `redirect_uri` 和允许拿的 `scopes`。
- 走授权时如果发现用户还没登录，后端先把这次授权请求暂存几分钟，跳去 `account.xdsec.org` 登完后再自动跳回原应用。
- 接入方按 OIDC 标准验签、检查 `state` / `nonce` 和有效期，并固定用 `(iss, sub)` 认人。
- 每个应用上线前都要测清楚三件事：在应用里点退出会发生啥、在 SSO 点退出应用会不会跟着退、管理员封号后用户在下游最长还能活动多久。

### 6.2 两个老系统怎么兼容（周报和 Flarum）

| 老系统 | 怎么接 | 测试环境重点测什么 |
|---|---|---|
| **周报系统** | 用服务器上现有的 **Nginx `auth_request`**：<br>1. `xdsec-sso` 写一个内部校验接口和周报回调入口，专门给周报域名种一个独立的会话 Cookie（不动 `account.xdsec.org` 的 `__Host-sso_session`）；<br>2. Nginx 每次收到周报请求先问一下 `xdsec-sso`，验过了就用 `auth_request_set` 强制覆盖 `X-Email` 头转给只监听 `127.0.0.1` 的周报后端；没登录就 302 跳去登录页。 | 登录回跳、老账号邮箱对得上、历史周报还在、退出和封号后能不能立刻拦住。 |
| **Flarum 论坛** | 先实测现网 Flarum 版本能不能装开源 OIDC 插件，能装就直接连上面的内置 OIDC 接口；实在因为版本太老装不了，再单独写个适配现网 JWT 插件的小接口（锁死签发方、受众和短有效期）。 | 老账号绑定、新号首次进论坛、历史帖子归属、管理员/版主角色和退出登录。 |

以后老系统如果升级原生支持标准 OIDC 了，把对应的兼容代码删掉就行。

---

## 7. 上线迁移步骤

新系统在测试环境验证没问题后，选一个空闲时间统一把老系统切过来，分两步走：

### 切换前（测试环境先练一遍）
1. **核对老账号**：整理旧系统（Kratos、周报、Flarum）的用户数据，把老账号和新 SSO 的 UUID 一一对应好。遇到重名或邮箱冲突的，提前人工确认。
2. **演练导入和回滚**：用脱敏数据在测试环境跑一遍导入脚本，测试重复导入会不会出错，也演练一遍出问题后怎么退回老系统。
3. **检查历史数据**：在测试环境核对用户总数、管理员权限，确认历史周报和论坛帖子都还挂在正确的人名下；明确哪些旧密码能直接迁、哪些需要发邮件重设。
4. **上线条件**：所有要迁的应用在测试环境都验收通过，没有未处理的账号冲突，导入和回滚都演练成功。

### 切换当天（正式上线）
1. **先备份、停写入**：备份旧用户数据和各应用的认证配置，暂时冻结旧系统的账号修改，避免导入中途产生漏掉的新数据。
2. **正式导入并切入口**：导入最终数据并核对人数、权限和封禁状态，在同一时间把周报和论坛的登录入口切到新 SSO，并让旧登录态失效。
3. **抽测没问题再放开**：开放正常访问前，先抽几个老账号测一遍登录、权限、历史周报和历史帖子。
4. **出问题立刻回滚**：如果发现账号绑错、权限异常或登录失败，马上把认证配置切回老系统；如果切换期间已经有人在新系统里改过密码、封过号或建过新号，先人工核对处理这几条记录，再恢复旧系统正常写入。
