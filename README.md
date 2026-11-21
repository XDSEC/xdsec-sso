<div align="center">
    <a href="https://xdsec.org">
        <img src="./arts/logo.png" style="width: 75%" alt="XDSEC" />
    </a>
    <p><em>XDSEC 单点登录系统</em></p>
</div>

## 项目结构

```
xdsec-sso
    arts/
    crates/          # 后端
    deploy/          # 部署
    web/             # 前端
    api.md           # API 文档
    Cargo.toml
    CONTRIBUTING.md
    LICENSE
    README.md
```

## 技术栈

- **后端：** Rust
    - **运行时：** tokio
    - **HTTP服务：** axum
    - **中间件：** tower
    - **数据库操作：** sea-orm
- **前端：** *待定*

## TODO

- [ ] HTTP 服务器框架
- [ ] 数据模型及数据库连接
- [ ] API 实现
- [ ] 登录相关
