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

## 核对实际连接

运行 `npm run doctor` 会只读请求与前端同一配置的 `/product/config`，列出后端实际选择的资产路径及配置身份。它区分API不可达、HTTP错误、配置响应无效和产品未配置；不会自动启动后端或创建常驻服务。前端和API均未启动时没有监听是正常状态，不能据此判定数据库损坏。

使用AQ版本管理中的部署模板准备一份仓库外清单，再用同一清单输出的命令启动API和前端。数据、账户和运行环境不得加入Web仓库。开发机器上的 `ashare-local` 是部署实例，不是应整体加入Git的源码目录。

旧 `.local/research-stores.json` 不被新版Web读取，也不是正式数据清单；其中历史bao/sina别名不能决定 `#/data` 的数据源。应清空停用别名，使用AQ部署清单登记发布存储。`#/data` 的资产来源与配置身份以及 `npm run doctor` 的实际响应应一致。

Web测试模块、契约比对和打包核验使用的临时目录已在各自 `finally` 中清理。请使用 `npm run check`，不要将整份运行环境或测试数据库作为发布证据复制到仓库；需要保留失败材料时显式限定文件范围。
