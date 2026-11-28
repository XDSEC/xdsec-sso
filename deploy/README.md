# 测试部署

## 环境部署

项目所需的其他环境均采用 docker 容器方式部署。端口使用情况如下：

|端口|服务|
|-|-|
|7091|PostgreSQL|
|7092|Redis|
|7097|Nginx|

切换到本目录（`deploy`），编辑 `.env` 文件，修改必要字段后先 `source .env` 再使用 `docker-compose` 部署。

```bash
source .env
docker compose up -d
```

其他常用操作：

```bash
docker compose stop    # 停止服务
docker compose restart # 重启服务
```

使用完毕需要清理时，使用以下指令：

```bash
docker compose down -v --rmi local --remove-orphans
```

该命令将会停止已启动的服务，并且删除**容器、数据卷（`-v`）、本地构建的镜像（`--rmi local`）**。

## 后端部署

在项目根目录使用 `cargo` 构建并运行：

```bash
cargo run           # 运行 debug 配置
cargo run --release # 运行 release 配置
cargo run -- -v     # 可以通过 -- 来指定传递给服务端主程序的参数
```
