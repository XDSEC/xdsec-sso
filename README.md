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

### 后端

|项目|解决方案|
|-|-|
|语言|[Rust](https://rust-lang.org/zh-CN/)|
|核心框架|[tokio](https://tokio.rs/) + [axum](https://axumrust.com/) + [sea-orm](https://www.sea-ql.org/SeaORM/) + [tracing](https://tracing.rs/)|
|关系型数据库|[PostgreSQL](https://www.postgresql.org/)|
|缓存数据库|[Redis](https://redis.io/)|
|虚拟化|[Docker](https://www.docker.com/)|

### 前端

暂无......

## 架构图

```mermaid
architecture-beta
    group host(server)[Host]
    group docker[Docker] in host
    service ssd(disk)[Storage] in host
    service postgres(database)[PostgreSQL] in docker
    service redis(database)[Redis] in docker
    service sso(server)[SSO Server] in host
    service journald(server)[journald] in host
    service nginx(server)[nginx] in host
    service web(internet)[frontend] in host
    service website(cloud)[website]
    
    ssd:L -- R:postgres
    sso:B --> T:journald
    postgres:L -- R:sso
    redis:L -- R:sso
    sso:T <-- B:nginx
    web:T <-- B:nginx
    website:R -- L:nginx
    align column postgres redis
    align row web sso postgres ssd
    align column sso journald
```
