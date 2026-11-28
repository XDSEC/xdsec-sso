# 后端

后端目前处于基本框架搭建状态，因此主要手写维护，不使用 agent 。

## 架构

|crate|类型|作用|
|-|-|-|
|common|lib|需要在所有包之间高度共享的项目，如数据模型|
|config|lib|配置文件的读取与加载|
|database|lib|数据库操作|
|server|bin|服务器主程序|

## todo list

- [X] 确定基本框架，明确方向
- [X] 完成配置文件的处理工作
- [X] 搭建 HTTP 服务器框架
- [ ] 完善数据模型、建表指令和数据库连接

## 核心 crate

|crate|作用|
|-|-|
|anyhow <br/> thiserror|社区惯用的异常处理体系|
|**axum**|HTTP 服务器框架|
|clap|命令行参数解析|
|**sea-orm**|数据库支持|
|**serde**|序列化与反序列化框架|
|time|提供日期时间服务|
|**tokio**|强大的异步运行时|
|tower|许多常用中间件的集合|
|**tracing**|完善的日志服务|