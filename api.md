# 西电信安协会统一身份验证系统接口文档

接口公共前缀：`/api`

实际的部署方式：go gin可以直接serve静态目录里的文件，这样前后端都可以跑在gin服务上，在服务器上占一个端口，比如`127.0.0.1:10086`。nginx弄个反代，将`account.xdsec.org`代理到10086。

在论坛或周报系统需要鉴权时，将用户跳转到本系统的登录页面，登录之后再跳转回去。

论坛的登录机制：跳转到对应页面，并加上一个param，比如`?type=forum&to=bbs.xdsec.org`这样。处理成功之后由前端跳转到论坛。（具体的情况需要等实际环境测试，目前让ai读了一下论坛能用的sso插件的代码，给了一份文档，附后）

周报的登录机制：通过nginx的设置，反代到本系统（`pass 127.0.0.1:10086/wr`），检测如果header里带token的cookie就再由本系统反代到周报服务的界面（`proxy 127.0.0.1:4567`，在header注入x-email）；没有就跳转到account.xdsec.org，登录后跳转到wr.xdsec.org就有token了，遵循前述处理方式。

（目前差不多也是这样，不过没登录时代理到的是kratos服务，也就是现在在用的登录系统）

系统不允许访客自行注册，只能通过管理员在管理界面导入。

## 数据模型

user

| name               | type    | meaning         |
|--------------------|---------|-----------------|
| uuid               | varchar | 用户统一编号（uuid4）   |
| username           | string  | 用户名，限制Ascii     |
| email              | varchar | 邮箱地址            |
| id                 | string  | ID，可中文，空格       |
| password           | varchar | bcrypt后的密码      |
| avatarUrl          | string  | 用户头像链接          |
| isTotpActivated    | boolean | 是否启用TOTP MFA    |
| totpSecret         | varchar | TOTP密钥          |
| isPasskeyActivated | boolean | 是否启用Passkey登录   |
| passkeySecret      | varchar | Passkey公钥       |
| isBanned           | boolean | 是否被管理员封禁        |
| isAdmin            | boolean | 是否为管理员          |

recoveryCode

| name          | type      | meaning |
|---------------|-----------|---------|
| email         | varchar   | 邮箱      |
| generatedTime | timestamp | 生成时间    |
| code          | varchar   | 验证码     |

emailCode

| name          | type      | meaning |
|---------------|-----------|---------|
| email         | varchar   | 邮箱      |
| code          | int       | 验证码     |
| generatedTime | timestamp | 生成时间    |

jwt

方便管理jwt token的远程注销

| name           | type      | meaning   |
|----------------|-----------|-----------|
| username       | varchar   | jwt对应的用户名 |
| jwt            | varchar   | jwt内容     |
| issueTime      | timestamp | jwt签发时间   |
| expirationTime | timestamp | jwt到期时间   |
| isRevoked      | boolean   | 是否被吊销     |

log

日志，方便管理员审计

| name          | type      | meaning           |
|---------------|-----------|-------------------|
| operator      | varchar   | 操作者的username      |
| action        | string    | 操作内容              |
| operationTime | timestamp | 操作时间              |
| receiver      | varchar   | 操作对象的username（如有） |

接口返回数据的基本框架

```json5
{
  "isSuccess": true,  // 是否成功
  "code": "totp.Missing", // 对应的错误码
  "reason": "服务器炸啦！", // 请求失败的原因，当失败时才返回
  "data": {
    "something": "something"  // data 里存返回的信息
  },
  "isTotpNeeded": false // 有的接口只返回一个信息，为了简便不用 data 装
}
```

jwt payload

```json5
{
  "username": "xiaoming",
  "id": "小明",
  "uuid": "xxxx-xxxx-",
  "email": "1@example.com",
  "issueTime": "timestamp",
  "isTotpActivated": true,
  "isTotpAuthenticated": false,
  "isPasskeyActivated": true,
  "isAdmin": false
}
```

接口可能的错误信息对照

前端可以针对 code 做对应的处理

| 提示信息                  | 含义                 |
|-----------------------|--------------------|
| totp.Missing          | 需要补充TOTP验证码        |
| totp.Wrong            | TOTP验证码错误          |
| parameter.BeyondAscii | 参数非Ascii字符         |
| parameter.Wrong       | 信息错误（用户名、邮箱、密码）    |
| parameter.Invalid     | 信息非法               |
| parameter.Conflict    | 参数冲突（修改信息时发生重复）    |
| email.SenderError     | 邮箱发送器异常，提示需要使用密码登录 |
| speedLimiter.TooFast  | 请求速度过快             |
| captcha.Missing       | 需要补充Captcha验证码     |
| server.InternalError  | 服务器内部错误            |

## 登录

### 密码登录

登录：
POST `/auth/login`

Payload：
```json5
{
  "username": "xiaoming",
  "email": "1@stu.xidian.edu.cn",
  "password": "123456"
}
```

Respond:

```json5
{
  "isSuccess": true,
  "token": "xxx" // 前端可以通过解码jwt获得用户信息，把jwt存本地存储（不存cookie），后面鉴权的时候带上
}
```

解码jwt后如果发现`isTotpActivated`为true，而`isTotpAuthenticated`为false，则需要进一步进行totp验证，通过下面这个接口换取`isTotpAuthenticated`为true的jwt。

POST `/auth/login/totp`

Payload：
```json5
{
  "totp": "123456"  // TOTP验证码
}
```

Response：
```json5
{
  "isSuccess": true,
  "token": "xxx"  // 新签发的jwt
}
```

jwt token后续请求接口的时候放在Authorization Header。

### 忘记 / 重置密码

POST `/auth/missPassword`

Payload:

```json5
{
  "email": "1@example.com"
}
```

Response:

```json5
{
  "isSuccess": true // 无论邮箱是否存在都返回true
}
```

后端会将包含链接的邮件发送到对应的邮箱，用户登录邮箱点击链接进行后续的流程。

链接的结构、流程等前端设计好url结构再议。

## PassKey登录与绑定

待补充

## 账户管理（非管理员）

读本地存储的jwt获取用户信息。

修改非敏感的账号信息（除密码、TOTP、Passkey、邮箱外）

PATCH `/auth/me`

Payload:

```json5
{
  "id": "xxx", // 改啥传啥
  "username": "xxx",
  "avatar": "base64"
}
```

Response:

```json5
{
  "isSuccess": true,
  "token": "xxx"  // 新的jwt
}
```

敏感信息的修改策略：

| 要修改的信息  | 安全策略                          | 思考                           |
|---------|-------------------------------|------------------------------|
| 邮箱      | 修改前邮箱验证码（或TOTP等方式）&&修改后的邮箱验证码 | 要确认修改后的邮箱归属权，否则可以借此得知协会他人的邮箱 |
| TOTP    | TOTP、邮箱验证码、恢复码、Passkey等任一方式   | 暂无需要考虑的场景                    |
| Passkey | 同TOTP                         | 同TOTP                        |

## 敏感操作的二次验证

可以使用邮箱验证码、TOTP、Passkey进行验证

此处与登录操作不同，登录不能使用邮箱验证码登录

需要验证的敏感操作有：修改验证信息（密码、TOTP、Passkey、邮箱），注销账号，管理员导入账号

### 发送邮箱验证码

GET `/auth/email/send`

Response:

```json
{
  "isSuccess": true
}
```

## 管理员管理用户

### 新增用户

POST `/admin/user/add`

```json5
{
  "username": "xiaoming",
  "email": "1@example.com",
  "id": "小明", // ID，可中文，可留空
  "isAdmin": false  // 新添加的用户是否为管理员
}
```

本接口不设置新用户的密码，密码由用户通过重置密码设置。

Response:

```json5
{
  "isSuccess": true
}
```

### 批量导入用户

POST `/admin/user/import`

### 封禁 / 解禁用户

POST `/admin/user/suspend` 封禁用户

POST `/admin/user/unsuspend` 解封用户

```json5
{
  "reason": "quit xdsec", // 解封的时候可以不填写本项内容
  "uuid": "xxx"
}
```
原先两个接口共用uri，但需要考虑防重放的问题，必须要在payload里面加一个action（suspend或unsuspend），这个设计在名字为`suspend`的接口下显得比较奇怪，所以拆成两个uri。

### 用户列表

GET `/admin/user/list`

```json5
{
  "isSuccess": true,
  "data": [
    {
      "isBanned": false,
      "isAdmin": false,
      "isPasskeyActivated": false,
      "isTotpActivated": false,
      "detail": {
        "uuid": "n1ks-ank4-...",
        "username": "xxx",
        "email": "xxx",
        "avatarUrl": "xxx"
      }
    },
  ]
}
```

## Flarum SSO 登录注册逻辑

```
[用户点击"登录"按钮]
    ↓
[前端 forum/index.tsx] override LogInModal.oncreate
    → 不弹出 Flarum 原生登录框
    → 直接跳转到设置的外部 login_url（如 WordPress 或其他 SSO 系统）
        ↓
外部系统完成登录，生成 JWT Token，
通过 API 请求 GET /api/sso/jwt（带 Authorization: ******
        ↓
[JWTSSOController.handle()]
    1. 从 Authorization 头提取 JWT
    2. 用配置的算法和密钥验证签名
    3. 校验 iss（发行者）、aud（受众=Flarum URL）、有效期
    4. 从 JWT claims 中提取 user 数据
    5. 尝试按 id/email/username 查找用户：
       - 找到 → 更新头像
       - 未找到 → 以管理员 Actor 身份调用 RegisterUser 命令自动注册
    6. 生成 SessionAccessToken 或 RememberAccessToken
    7. 返回 { token, userId }
        ↓
外部系统将 token 写入 Cookie（名称如 flarum_token 或 flarum_remember）
        ↓
用户再次访问 Flarum 时：
[LoginMiddleware.process()]
    → 读取 Cookie 中的 {prefix}_token 或 {prefix}_remember
    → 如果 token 有效且当前用户是 Guest
    → 调用 SessionAuthenticator::logIn() 完成自动登录
    → 302 重定向回当前页面（已登录状态）
```

```
用户点击"注册"按钮
    ↓
[前端] 同登录逻辑，按钮 href 替换为外部 signup_url
    → 直接跳转到外部 SSO 系统的注册页面

外部系统注册完成后，同样走 JWT API 流程（同登录流程）
JWTSSOController 检测到用户不存在时：
    → 设置 isEmailConfirmed = true（跳过邮件验证）
    → 以管理员 Actor 调用 RegisterUser 命令创建用户
    ↓
触发 Registered 事件
    ↓
[ActivateUser.activateUser()]
    → 调用 $user->activate() 并保存
    → 确保用户注册后立即激活，无需邮件确认
```

注销流程

- 方式一：外部系统主动触发 Flarum 注销（推荐）

写入一个注销标记 Cookie：

|Cookie 名称|值|说明|
|:-:|:-:|:-:|
|{prefix}_logout|任意值（如 1）|触发 Flarum 注销|

LogoutMiddleware 检测到此 Cookie 后，自动将用户重定向到 Flarum 注销流程，注销完成后重定向回原页面（用户无感知）。

- 方式二：用户在 Flarum 主动注销

用户点击 Flarum 的"注销"后，会将浏览器重定向到配置的 logout_url，由外部系统完成清除自身 Session 和 Cookie 的操作。