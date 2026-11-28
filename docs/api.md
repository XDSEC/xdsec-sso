# API 文档

API 的具体实现在 [`/crates/server/src/api`](/crates/server/src/api/) 中。

本文档会列出当前已经实现的 API 。

## API v1

基路径： `/v1`

|路径|方法|作用|
|-|-|-|
|/status|GET|只返回`alive`，判断是否存活|

## Debug

基路径： `/debug`

|路径|方法|作用|
|-|-|-|
|/state|GET|以 JSON 格式打印服务器状态机|
|/echo|POST|将请求体的内容原封不动地返回|
