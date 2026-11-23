# 部署

项目使用的 PostgreSQL 和 Redis 均采用 Docker 容器方式部署。

项目本体在生产环境中直接在主机上运行。

## 数据库部署

切换到本目录（`deploy`），编辑 `.env` 文件，修改必要字段后先 `source .env` 再使用 `docker-compose` 部署。

```bash
docker compose up -d
```

PostgreSQL 会在 `7091` 端口开放，Redis 会在 `7092` 端口开放，前者的数据还会持久化保存在数据卷 `xdsec-sso-db` 中。

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