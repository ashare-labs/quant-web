# 本机配置

前端连接已经由使用者准备好的 AQ 服务。开发命令只启动前端，不安装或启动后端，不创建账户、数据集或 worker。

| 环境变量 | 默认值 | 后端前缀 |
|---|---|---|
| `FRONTEND_PORT` | `41839` | 前端监听端口 |
| `PORTFOLIO_API_URL` | `http://127.0.0.1:18839` | `/api/v1/portfolio` |
| `TASKS_API_URL` | `http://127.0.0.1:18839` | `/api/v1/tasks/daily` |
| `EXECUTION_API_URL` | `http://127.0.0.1:18839` | `/api/v1`，包含行情读取 |
| `PAPER_API_URL` | `http://127.0.0.1:18818` | `/api/v1/paper` |

地址只接受 HTTP loopback origin，不接受凭据、查询参数或路径。通过环境变量传入；不把个人目录写进契约或源码。端口冲突会直接报错。

```sh
TASKS_API_URL=http://127.0.0.1:19000 npm run dev
```

AQ 的通用服务承载任务、组合与行情接口；paper 使用独立服务。数据导入、策略注册、存储别名和账户准备均使用配对 AQ 的本地 CLI。浏览器只接收 dataset ID、公开别名、策略版本等标识。

“契约不匹配”时，先核对服务地址，再按[契约更新](contracts.md)同步同一候选。不要删除身份检查来接通旧服务。新版本的 sessionStorage 键与旧页面分离；待核对请求始终绑定创建时的源码身份和幂等键。

静态包部署时，服务器需将 `/portfolio-api/`、`/tasks-api/`、`/execution-api/`、`/paper-api/` 按上表转发。Vite 开发代理仅在 `dev` 和 `preview` 中生效，不包含在静态 JS 中。
