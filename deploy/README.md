# 部署

## 开发环境

切换到本目录（`deploy`），编辑 `.env` 文件，修改必要字段后使用 `docker-compose` 部署。

```bash
docker compose -f docker-compose.dev.yml up -d
```

PostgreSQL 会在 `7091` 端口开放，Redis 会在 `7092` 端口开放，前者的数据还会持久化保存在数据卷 `xdsec-sso-db` 中。

其他常用操作：

```bash
docker compose -f docker-compose.dev.yml stop # 停止服务
docker compose -f docker-compose.dev.yml restart # 重启服务
```

使用完毕需要清理时，使用以下指令：

```bash
docker compose -f docker-compose.dev.yml down -v --rmi local --remove-orphans
```

该指令将会停止已启动的服务，并且删除**容器、数据卷、本地构建的镜像**。