# 本机配置

前端连接已经由使用者准备好的 AQ 服务。开发命令只启动前端，不安装或启动后端，不创建账户、数据集或 worker。

| 环境变量 | 默认值 | 后端前缀 |
|---|---|---|
| `FRONTEND_PORT` | `41839` | 前端监听端口 |
| `ASHARE_API_URL` | `http://127.0.0.1:18839` | 统一组合、任务、正式数据和执行服务 |
| `ASHARE_PAPER_URL` | `http://127.0.0.1:18818` | 独立 paper 服务 |
| `PORTFOLIO_API_URL` | `http://127.0.0.1:18839` | `/api/v1/portfolio` |
| `TASKS_API_URL` | `http://127.0.0.1:18839` | `/api/v1/tasks/daily` |
| `EXECUTION_API_URL` | `http://127.0.0.1:18839` | `/api/v1`，包含 `/product` 正式数据与固定样本行情 |
| `PAPER_API_URL` | `http://127.0.0.1:18818` | `/api/v1/paper` |

统一启动使用 AQ 部署清单输出的 `FRONTEND_PORT`、`ASHARE_API_URL` 和 `ASHARE_PAPER_URL`；web 不再解析一份自己的数据路径。分功能 URL 环境变量仅用于明确的覆盖，优先于统一地址。API 与 worker 必须使用同一清单、profile 和状态库。

地址只接受 HTTP loopback origin，不接受凭据、查询参数或路径。通过环境变量传入；不把个人目录写进契约或源码。端口冲突会直接报错。

```sh
ASHARE_API_URL=http://127.0.0.1:19000 FRONTEND_PORT=41900 npm run dev
```

AQ 的通用服务承载任务、组合与行情接口；paper 使用独立服务。主库与发布存储由部署清单指定。浏览器从 `/product/config` 显示当前 profile、配置身份与公开资产说明；股票搜索、行情读取和窗口发布通过 AQ 调用 AD 公共接口。浏览器不填写数据库路径。

未配置正式数据时页面会显示后端原因，不使用固定样本。草稿与新提交绑定配置身份；更换 profile、状态库或恢复到不同根目录后，旧草稿保留并提示环境不匹配，须明确重选当前数据。旧版未记录环境的待确认请求不会自动重发。

“契约不匹配”时，先核对服务地址，再按[契约更新](contracts.md)同步同一候选。不要删除身份检查来接通旧服务。新版本的 sessionStorage 键与旧页面分离；待核对请求始终绑定创建时的源码身份和幂等键。

静态包部署时，服务器需将 `/portfolio-api/`、`/tasks-api/`、`/execution-api/`、`/paper-api/` 按上表转发。Vite 开发代理仅在 `dev` 和 `preview` 中生效，不包含在静态 JS 中。
