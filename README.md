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
    AGENTS.md        # AI Agent 协作规范
    api_v1.md        # API v1 接口文档
    Cargo.toml
    CONTRIBUTING.md
    LICENSE
    README.md
    todo.md
```

## 技术栈

### 后端

|项目|解决方案|
|-|-|
|语言|[Rust](https://rust-lang.org/zh-CN/)|
|核心框架|[tokio](https://tokio.rs/) + [axum](https://axumrust.com/) + [sea-orm](https://www.sea-ql.org/SeaORM/) + [tracing](https://tracing.rs/)|
|缓存数据库|[Redis](https://redis.io/)|

### 前端

|项目|解决方案|
|-|-|
|语言|[TypeScript](https://www.typescriptlang.org/)|
|核心框架|[React 19](https://react.dev/) + [Vite](https://vite.dev/) + [React Router](https://reactrouter.com/) + [TanStack Query](https://tanstack.com/query)|
|样式与组件|[Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)|
|代码规范与测试|[Biome](https://biomejs.dev/) + [Vitest](https://vitest.dev/) + [MSW](https://mswjs.io/)|

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
