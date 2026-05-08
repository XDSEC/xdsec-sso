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

| name               | type    | meaning       |
|--------------------|---------|---------------|
| uuid               | varchar | 用户统一编号（uuid4） |
| username           | string  | 用户名，限制Ascii   |
| email              | varchar | 邮箱地址          |
| id                 | string  | ID，可中文，空格     |
| password           | varchar | bcrypt后的密码    |
| avatarUrl          | string  | 用户头像链接        |
| isTotpActivated    | boolean | 是否启用TOTP MFA  |
| totpSecret         | varchar | TOTP密钥        |
| isPasskeyActivated | boolean | 是否启用Passkey登录 |
| passkeySecret      | varchar | Passkey公钥     |
| isBanned           | boolean | 是否被管理员封禁      |
| isAdmin            | boolean | 是否为管理员        |
| isRootAdmin        | boolean | 是否为根管理员       |
| isEmailLoginUsable | boolean | 邮箱登录是否被禁止     |

recoveryCode

| name          | type      | meaning |
|---------------|-----------|---------|
| email         | varchar   | 邮箱      |
| generatedTime | timestamp | 生成时间    |
| code          | varchar   | 验证码     |

## 密码登录

登录：
POST `/auth/login`

Payload：
```json
{
  "username": "xiaoming",
  "email": "1@stu.xidian.edu.cn",
  "password": "123456"
}
```

Respond:

set cookie token = jwt_token

```json
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
}
```

当需要进行TOTP验证时返回如下错误信息：

HTTP 500

```json
{
  "message": "TOTP needed.",
  "rawData": {
    "username": "xiaoming",
    "email": "1@stu.xidian.edu.cn",
    "password": "123456"
  }
}
```

此时需要让用户填写六位数字，并回传。

```json
{
  "username": "xiaoming",
  "email": "1@stu.xidian.edu.cn",
  "password": "123456",
  "totp": "123456"
}
```

后端校验成功后给token，同上。

set cookie token = jwt_token

```json
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
}
```

如果需要使用恢复码，则回传内容改为：

```json
{
  "username": "xiaoming",
  "email": "1@stu.xidian.edu.cn",
  "password": "123456",
  "recoveryCode": "dhaikai1n3lcis8a"
}
```

常见的错误提示信息：（后端可以弄一个多语言，然后前端可以直接把后端的提示信息显示出来）

|提示信息| 含义                 |
|---|--------------------|
|TOTP needed| 需要补充TOTP验证码        |
|no Ascii| 参数非Ascii字符         |
|wrong info| 信息错误（用户名、邮箱、密码或验证码 |

## 邮箱验证码登录

POST `/auth/login/emailSend`

```json
{
  "email": "1@example.com"
}
```

Response:

```json
{
  "message": "email sent",
  "isTotpNeeded": true,
  "expireTime": "10m"
}
```

常见错误信息：

|信息| 含义                 |
|---|--------------------|
|Email Not Found| 没有找到邮箱             |
|Sender Error| 邮箱发送器异常，提示需要使用密码登录 |
|Method Unusable|用户设置不允许使用邮箱验证码登录|

POST `/auth/login/byEmail`

如果前面有 TOTP needed 则需要发送 TOTP 验证码。

```json
{
  "email": "1@example.com",
  "code": "sk10hq",
  "totp": "123456"
}
```

set cookie token = jwt_token

```json
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
}
```

## PassKey登录与绑定

待补充

## 账户管理（非管理员）

GET `/auth/me`

```json
{
  "isBanned": false,
  "isAdmin": false,
  ""
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