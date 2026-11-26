# XDSEC SSO API v1.1 接口文档

这份文档用于前后端联调，约定新版 XDSEC 统一登录系统（`https://account.xdsec.org`）的接口格式、登录安全规则、应用接入方式和上线步骤。所有业务接口统一以 `/api/v1` 开头（下面写路径时省略这个前缀）。

新系统会先在测试环境开发并把论坛、周报逐个联调通，全部没问题后，再挑一个空闲时间把老账号导过来、统一切换登录入口。

---

## 1. 基础约定

### 1.1 部署与存储
- **前后端同域名**：页面和后端接口都挂在 `https://account.xdsec.org` 下。
- **复用现有 MySQL + 保留轻量 Redis**：后端通过 SeaORM 兼容 MySQL / PostgreSQL / SQLite（线下开发可用 Docker 跑 PG，线上直接连服务器现成的 **MySQL** 新建独立库，不再单独起 PostgreSQL 容器）；同时保留轻量 **Redis** 统一管理所有带过期时间（TTL）的会话和临时凭据（部署时配置 `maxmemory` 内存上限兜底）。
  - **存数据库（MySQL）**：用户资料、密码哈希、MFA 密钥与恢复码、改密/激活链接 Token、管理员操作日志。
  - **存 Redis（TTL 自动过期）**：普通登录 Session、5 分钟 Sudo 状态、短时 MFA 登录挑战、新成员激活挑战与待确认 TOTP 密钥、OIDC 授权码、接口限流计数（按用户维护会话索引，支持改密/封禁时一键清空全部设备会话）。

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
- **Session Cookie**：只有 `status === "active"` 的正常账号才能获得登录会话；登录或完成激活后，后端生成一个随机字符串作为 Session ID，放进 Cookie `__Host-sso_session`，属性固定为 `Secure; HttpOnly; SameSite=Lax; Path=/`。
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
  `identifier` 同时支持用户名或邮箱。只要账号不存在、密码错、尚未完成激活（`pendingActivation`）或被封了，一律返回 `401 (invalid_credentials)`。
- 如果账号没开 MFA，直接登录成功（返回 `200`，写入 Session Cookie）：
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
| `POST /auth/activations/password` | 无需登录 | 新成员激活第 1 步：凭激活邮件 Token 设初始密码，换取短时激活挑战凭据 |
| `POST /auth/activations/totp/setup` | 无需登录（凭 `activationToken`） | 新成员激活第 2a 步：生成首个 TOTP 密钥与 `otpauthUri` |
| `POST /auth/activations/totp/verify` | 无需登录（凭 `activationToken`） | 新成员激活第 2b 步：验证 6 位动态码，原子完成激活并返回恢复码 |
| `POST /auth/password-reset-requests` | 无需登录 | 忘记密码 / 重发激活邮件 |
| `POST /auth/password-resets` | 无需登录 | 老用户凭重置邮件 Token 重设密码 |
| `GET /me` | 已登录 | 看自己的资料 |
| `PATCH /me` | 已登录 + CSRF | 改自己的昵称 |
| `POST /me/password-changes` | 已登录 + CSRF + **Sudo** | 改自己的密码 |
| `POST /me/mfa/totp/setup` | 已登录 + CSRF +（首次验当前密码 / 非首次走 **Sudo**） | 发起 TOTP 绑定或换绑，获取 `secret` 与 `otpauthUri` |
| `POST /me/mfa/totp/verify` | 已登录 + CSRF | 提交 6 位动态码确认绑定/覆盖换绑 TOTP（`0 -> 1` 时返回恢复码） |
| `DELETE /me/mfa/totp` | 已登录 + CSRF + **Sudo** | 解绑当前账号的 TOTP（禁止删光最后一个 MFA） |
| `POST /me/mfa/recovery-codes` | 已登录 + CSRF + **Sudo** | 重刷一套新恢复码（旧码立刻作废） |

### 4.1 激活、找回密码和恢复码规则

#### 邮件落地 URL 与 Token 隔离
- 邮件里的前端落地 URL 区分为两类（URL 和请求体中均只需传 `token`，无需额外传类型字段；后端在数据库内区分“首次激活 Token”与“重置密码 Token”，跨接口混用、过期或已消费一律返回 `400 invalid_challenge`）：
  - **首次激活**：`https://account.xdsec.org/activate?token=act_...`（由管理员建号 `POST /admin/users` 触发，或待激活账号调找回接口重发）。
  - **找回密码**：`https://account.xdsec.org/reset-password?token=rst_...`（仅面向已激活的 `active` 账号）。
- **防邮件客户端预加载**：用户点击邮件链接仅打开前端对应路由页面，后端不提供消耗型 GET 校验，只有在真正提交表单时才消费 Token。

#### 新老成员的 MFA 与恢复码策略
- **新成员（`pendingActivation`）**：必须走完 **“第 1 步设初始密码 → 第 2 步绑首个 MFA（首期为 TOTP，后续可扩展 Passkey）→ 第 3 步勾选已保存恢复码”**，账号才会变成 `active`，保证新成员 100% 开启 MFA。
- **迁移过来的老成员（`active`）**：不卡正常登录看周报和论坛，靠登录后的弹窗提示 + 做敏感操作时返回 `403 (mfa_required)` 引导尽快补绑。
- **单 TOTP 与禁止降级规则**：每个账号最多保留 `1` 个生效的 TOTP 密钥；一旦账号开启了 MFA（无论新成员还是已补绑的老成员），**严禁用户自行删光最后一个 MFA 退回纯密码状态**（换手机走 `setup -> verify` 覆盖换绑；手机与恢复码全丢时仅限管理员调后台重置接口兜底）。
- **恢复码（Recovery Codes）**：
  - **只有当账号从 `0 个 MFA` 变成 `1 个 MFA`（绑完第一个 MFA）时**，后端才自动生成一套一次性恢复码。后端只存哈希，明文只在这次确认绑定接口返回**唯一一次**。
  - 前端把恢复码展示出来，提供“复制 / 下载 `.txt`”按钮，必须勾选 **“我已妥善保存恢复码”** 才允许点完成。
  - 以后再加第 2 个、第 3 个 MFA（比如绑了 TOTP 又加了个 Passkey）时不重发恢复码（对应字段返回 `null`）；用户随时可以去个人中心过一遍 Sudo 手动重刷一批新的（旧的立刻作废）。

#### 新成员三步激活状态机与凭据传递（`/activate?token=act_...`）
为避免签发“半激活受限 Session”污染全局鉴权、OIDC 授权和同浏览器已有登录态，新成员激活采用与登录 MFA 一致的 **Redis 短时激活挑战凭据（`activationToken`）** 串联三步：

1. **第 1 步：设初始密码（`POST /auth/activations/password`）**
   - 请求体：
     ```json
     {
       "token": "act_...",
       "newPassword": "new-strong-password"
     }
     ```
   - 后端校验该邮件 `token` 为未过期的**首次激活 Token**且目标账号处于 `pendingActivation`（若无效、跨接口混用、已消费或账号已被封禁，均返 `400 invalid_challenge`），校验新密码合规后计算 Argon2id 哈希，连同 `userId` 和邮件 `token` 标识暂存入 Redis（TTL `1800` 秒），返回交给前端存内存的 `activationToken`：
     ```json
     {
       "activationToken": "act_chg_01J...",
       "expiresIn": 1800
     }
     ```
   - **暂不销毁邮件 `token`**：此时数据库里的邮件 `token` 尚未核销、账号仍为 `pendingActivation`。若用户在去手机安装验证器 App 时误刷新或关掉网页，仍可凭原邮件链接重新从第 1 步开始，不会把链接卡死。
2. **第 2a 步：获取首个 TOTP 密钥（`POST /auth/activations/totp/setup`）**
   - 请求体：
     ```json
     {
       "activationToken": "act_chg_01J..."
     }
     ```
   - 后端校验 `activationToken` 有效后生成 TOTP 密钥并写入同一条 Redis 激活记录（重复调用会覆盖前一次未确认的密钥），返回 `200`（二维码由前端用 `otpauthUri` 本地渲染，无需后端生成图片）：
     ```json
     {
       "secret": "JBSWY3DPEHPK3PXP",
       "otpauthUri": "otpauth://totp/XDSEC:xiaoming?secret=JBSWY3DPEHPK3PXP&issuer=XDSEC&algorithm=SHA1&digits=6&period=30"
     }
     ```
     > 后续支持 Passkey 作为首个 MFA 时，直接并列新增 `/auth/activations/passkey/start` 与 `/finish` 消费同一个 `activationToken` 即可，第 1 步和第 3 步无需改动。
3. **第 2b 步：确认绑定 TOTP 并原子激活（`POST /auth/activations/totp/verify`）**
   - 请求体：
     ```json
     {
       "activationToken": "act_chg_01J...",
       "code": "482910"
     }
     ```
   - 校验 `activationToken` 与 6 位动态码（过期、不匹配或输错太多次被销毁均返 `400 invalid_challenge`）。
   - 验证通过后，在**同一个数据库事务**中完成：
     1. 锁定并核销邮件激活 `token`（防多标签页并发重放），再次确认账号为 `pendingActivation`；
     2. 写入第 1 步的密码哈希、本次确认的 TOTP 密钥、新生成的一套恢复码哈希；
     3. 将 `emailVerified` 置为 `true`、`status` 由 `pendingActivation` 切换为 `active`。
   - 事务提交后立刻删除 Redis 中的 `activationToken`，同时直接签发正式登录会话并写入 `__Host-sso_session` Cookie（避免用户几秒后点完成跳去重登时撞上同一个 30 秒 TOTP 时间片防重放拦截），返回 `200`：
     ```json
     {
       "recoveryCodes": [
         "a1b2c-3d4e5",
         "f6g7h-8j9k0"
       ]
     }
     ```
4. **第 3 步：确认保存恢复码（前端强制闭环）**
   - 前端展示 `recoveryCodes` 并提供“复制 / 下载 `.txt`”按钮，用户必须勾选 **“我已妥善保存恢复码”** 后才解锁“完成激活”按钮；点击后调 `GET /session` 同步登录态并进入系统。
   - **异常关闭兜底**：由于第 2b 步验过动态码后账号已在服务端原子切为 `active`，即便用户在第 3 步未点按钮就直接关闭浏览器，手机验证器里的动态码和刚设的密码也已成对生效，不会出现“手机已绑码但账号仍未激活”的死锁；后续正常登录后可在个人中心重刷恢复码。

#### 忘记密码与重置密码（`/reset-password?token=rst_...`）
- **`POST /auth/password-reset-requests`**
  - 请求体：`{ "email": "user@example.com" }`
  - 无论邮箱是否存在或处于何种状态，接口统一返回 `202` 和 `{ "status": "accepted" }`（防枚举账号）。
  - 后端内部按状态分流：
    - 账号为 `active`：发送重置密码邮件（落地 `/reset-password?token=rst_...`）；
    - 账号为 `pendingActivation`（例如首次激活链接过期或中途放弃后重来）：重发首次激活邮件（落地 `/activate?token=act_...`，旧激活 Token 作废）；
    - 邮箱不存在或账号为 `suspended`：静默忽略，不发邮件。
- **`POST /auth/password-resets`**
  - 请求体：`{ "token": "rst_...", "newPassword": "new-strong-password" }`
  - 仅接受未过期的**重置密码 Token**且目标账号处于 `active`（否则返 `400 invalid_challenge`）。
  - 在**同一个数据库事务**中核销该 Token 并更新密码哈希（保留账号原有的 MFA 与恢复码不变），提交后立即清空该用户在 Redis 里的全部旧会话与未兑换 OIDC 授权码。
  - 返回 `204`，前端跳回登录页让用户用新密码（及原有 MFA）重新登录。

---

### 4.2 个人中心与 MFA 管理接口

#### 基础资料与改密
- **`GET /me`**：返回 `200` 和当前用户的 `User` 对象。
- **`PATCH /me`**：需要 `X-CSRF-Token`，传 `{ "nickname": "新昵称" }`，返回 `200` 和改完后的 `User` 对象。
- **`POST /me/password-changes`**（需 Sudo）：需要 `X-CSRF-Token`，传 `{ "newPassword": "new-strong-password" }`，返回 `204`，同时踢掉所有设备的旧会话，前端跳去重新登录。

#### `POST /me/mfa/totp/setup`（发起 TOTP 绑定或换绑）
- 需要登录 Cookie + `X-CSRF-Token`。一个账号最多保留 `1` 个生效的 TOTP 密钥；已绑定 TOTP 的用户更换手机或验证器 App 时**无需先解绑**，直接重新走 `setup -> verify` 覆盖换绑即可。
- **身份核验按 §3.2 区分名下是否已有 MFA**：
  - **名下尚无任何 MFA（`mfaMethods` 为空 `[]`，如迁移老成员首次补绑）**：不走 Sudo，也不顺手签发 5 分钟 Sudo 窗口，请求体必须传入当前密码当场核验（缺字段返 `400 invalid_request`，密码错返 `401 invalid_credentials`）：
    ```json
    {
      "currentPassword": "your-current-password"
    }
    ```
  - **名下已有 MFA（`mfaMethods` 非空，包括已绑 TOTP 更换设备、或后续已绑 Passkey 再加绑 TOTP）**：统一走 `require_sudo` 中间件（旧设备还在可用旧 TOTP 过 Sudo，旧设备丢失可用恢复码过 Sudo；未过 Sudo 返 `403 reauthentication_required`），请求体传 `{}` 即可。
- 核验通过后，后端生成新 TOTP 密钥暂存于 Redis（绑定当前 `userId` + `sessionId`，有效期 10 分钟；重复调用覆盖上一次未确认的临时密钥），**此时绝不修改数据库里已生效的旧 TOTP 密钥**（中途放弃或关掉网页不影响原手机继续使用），返回 `200`（二维码由前端根据 `otpauthUri` 本地渲染，无需后端生成图片）：
  ```json
  {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/XDSEC:xiaoming?secret=JBSWY3DPEHPK3PXP&issuer=XDSEC&algorithm=SHA1&digits=6&period=30"
  }
  ```

#### `POST /me/mfa/totp/verify`（确认绑定或覆盖换绑 TOTP）
- 需要登录 Cookie + `X-CSRF-Token`（直接消费当前会话在 `setup` 阶段暂存的待确认密钥，无需重复传密码或再验 Sudo）。
- 请求体：
  ```json
  {
    "code": "482910"
  }
  ```
- 若暂存密钥不存在/已过期，或 6 位动态码校验失败，均返回 `400 (invalid_challenge)`（输错次数过多直接销毁暂存密钥）。
- 验证通过后清除 Redis 暂存密钥，并在**同一个数据库事务**中写入新密钥，返回 `200`：
  - **首次开启 MFA（从 `0 个 MFA -> 1 个 MFA`）**：写入该 TOTP 密钥，并自动生成一套一次性恢复码（库内只存哈希），在响应体中**唯一一次返回明文数组**，前端必须引导用户复制/下载并勾选确认已保存：
    ```json
    {
      "recoveryCodes": [
        "a1b2c-3d4e5",
        "f6g7h-8j9k0"
      ]
    }
    ```
  - **覆盖换绑或新增绑定（操作前名下已有 MFA）**：
    - **覆盖换绑（原本已绑有 TOTP）**：直接用本次验证通过的新 TOTP 密钥**原子覆盖**数据库里的旧 TOTP 密钥，旧设备上的动态码即刻失效，全程无“0 MFA”真空期；
    - **加绑（如后续版本已绑 Passkey、首次加绑 TOTP）**：新增写入该 TOTP 密钥；
    - 以上两种情况均保留原有恢复码不变，不重发恢复码，固定返回 `{ "recoveryCodes": null }`。

#### `DELETE /me/mfa/totp`（解绑 TOTP，需 Sudo）
- 需要登录 Cookie + `X-CSRF-Token` + **Sudo**（名下无任何 MFA 时由 `require_sudo` 直接返 `403 mfa_required`；未绑定 TOTP 时返 `409 invalid_user_state`）。
- **严禁删光最后一个 MFA**：若当前账号名下仅剩 `"totp"` 这唯一一种 MFA 方式（`mfaMethods` 长度为 `1`，首版未接入 Passkey 前均属此类），直接返回 `409 (invalid_user_state)` 拒绝解绑，防止账号退回无 MFA 状态（更换设备请走上面的 `setup -> verify` 覆盖换绑）。
- 仅当账号同时绑有其他 MFA（如后续版本同时绑了 `Passkey + TOTP`，`mfaMethods` 长度 `> 1`）时，才允许删除 TOTP 密钥并返回 `204`（原有恢复码继续保留）。

#### `POST /me/mfa/recovery-codes`（重刷恢复码，需 Sudo）
- 需要登录 Cookie + `X-CSRF-Token` + **Sudo**（名下无任何 MFA 时由 `require_sudo` 直接返 `403 mfa_required`）。
- 请求体：`{}`。
- 在同一个数据库事务中作废全部旧恢复码并生成一整套新恢复码（库内仅存哈希），返回 `200`（明文仅此次返回一次）：
  ```json
  {
    "recoveryCodes": [
      "m2n3p-4q5r6",
      "s7t8u-9v0w1"
    ]
  }
  ```

> **后续版本迭代**：Passkey 登录/注册、改邮箱、换头像、注销账号留到后续版本再加。

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
- 返回 `201` 和新建的 `User` 对象（`status` 为 `pendingActivation`、`emailVerified` 为 `false`），后台发首次激活邮件（前端落地 `/activate?token=act_...`）。重名或邮箱重复返回 `409 (user_conflict)`。

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
- 走授权时如果发现用户还没登录，后端先把这次授权请求暂存几分钟，302 跳转到 `https://account.xdsec.org/login?returnTo=...`（详见 §6.3），登完后再由后端完成授权并跳回原应用。
- 接入方按 OIDC 标准验签、检查 `state` / `nonce` 和有效期，并固定用 `(iss, sub)` 认人。
- 每个应用上线前都要测清楚三件事：在应用里点退出会发生啥、在 SSO 点退出应用会不会跟着退、管理员封号后用户在下游最长还能活动多久。

### 6.2 两个老系统怎么兼容（周报和 Flarum）

| 老系统 | 怎么接 | 测试环境重点测什么 |
|---|---|---|
| **周报系统** | 用服务器上现有的 **Nginx `auth_request`**：<br>1. `xdsec-sso` 写一个内部校验接口和周报回调入口，专门给周报域名种一个独立的会话 Cookie（不动 `account.xdsec.org` 的 `__Host-sso_session`）；<br>2. Nginx 每次收到周报请求先问一下 `xdsec-sso`，验过了就用 `auth_request_set` 强制覆盖 `X-Email` 头转给只监听 `127.0.0.1` 的周报后端；没登录就 302 跳去登录页并附带同源 `returnTo`（见 §6.3）。 | 登录回跳、老账号邮箱对得上、历史周报还在、退出和封号后能不能立刻拦住。 |
| **Flarum 论坛** | 先实测现网 Flarum 版本能不能装开源 OIDC 插件，能装就直接连上面的内置 OIDC 接口；实在因为版本太老装不了，再单独写个适配现网 JWT 插件的小接口（锁死签发方、受众和短有效期）。 | 老账号绑定、新号首次进论坛、历史帖子归属、管理员/版主角色和退出登录。 |

以后老系统如果升级原生支持标准 OIDC 了，把对应的兼容代码删掉就行。

### 6.3 登录回跳参数约定（`returnTo`）

当未登录用户请求 OIDC `/authorize?...`、触发周报 Nginx `auth_request` 302 跳转、或走 Flarum 兼容入口时，统一通过同源 Query 参数 `returnTo` 串联“前端登录 → 交还 SSO 后端继续完成回调”：

- **统一参数格式**：
  - 跳转登录页 URL 统一为 `https://account.xdsec.org/login?returnTo=<URL编码后的本站路径>`，例如：
    - OIDC：`https://account.xdsec.org/login?returnTo=%2Fauthorize%3F...`
    - 周报：`https://account.xdsec.org/login?returnTo=%2Fapi%2Fv1%2Flegacy%2Fweekly%2Fcallback%3F...`（回跳至 SSO 同域名下的周报回调入口，而非直接填 `wr.xdsec.org`）
  - **边界分工**：前端登录页**只负责跳回 `account.xdsec.org` 本站路径**；真正跨域名重定向回下游应用（`bbs.xdsec.org`、`wr.xdsec.org` 等），一律由 SSO 后端按登记的白名单校验后执行。
- **前端防开放重定向（Open Redirect）与防 XSS 校验**：
  - 读取 `returnTo` 后必须严格校验，**必须同时满足以下条件**才允许使用，否则直接丢弃并默认跳回个人中心：
    1. 必须以单个正斜杠 `/` 开头（禁止 `http:`、`https:`、`javascript:`、`data:` 等任意协议）；
    2. 第 2 个字符不得为 `/` 或 `\`（禁止 `//evil.com`、`/\evil.com` 等协议相对 URL 绕过）；
    3. 通过 `new URL(returnTo, window.location.origin).origin === window.location.origin` 二次确认解析后严格同源，且不指向登录页自身（防止循环跳转）。
- **传递与跳转方式**：
  - 登录流程进入 MFA 第二步（`mfaRequired`）或老成员登录后关闭“建议开启 MFA”提醒框时，前端需保留已校验合法的 `returnTo` 不丢失。
  - 登录及 MFA 验证全部通过后，前端必须调用 **`window.location.assign(returnTo)`** 触发整页浏览器导航交还后端（不可用 SPA 前端路由跳转，确保浏览器携带已种下的 `__Host-sso_session` Cookie 向后端发起真实 HTTP 请求）。

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
