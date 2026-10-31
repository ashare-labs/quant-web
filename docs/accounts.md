# 账号模式接线说明

## 架构与职责边界

账号、密码、设备会话与资源归属检查由独立的 `quant-service` 后端提供。QuantWeb 仅使用同源 `HttpOnly` Cookie 维护会话，不在浏览器保存令牌，不建立第二套账号体系，也不改变收益计算或结果页布局。

未设置 `QUANT_SERVICE_URL` 的构建保持原有的可信本机单所有者直连模式；仅当显式配置 `QUANT_SERVICE_URL` 时才启用多账号客户端路由与跨账号本地存储隔离。

## 构建与入口配置

设置 `QUANT_SERVICE_URL=http://127.0.0.1:显式端口` 后构建与预览：

- 账号构建产物中的 `dist/quant-profile.json` 记录 `{"accounts": true}`，预览服务启动时会核对该配置，不一致时拒绝启动。
- `QUANT_SERVICE_URL` 不能与直连引擎环境变量（`AQ_API_URL` / `ASHARE_API_URL`、`PAPER_API_URL` / `ASHARE_PAPER_URL`）同时设置。
- 账号模式下 `/api` 仅代理至 `quant-service`，旧 `/paper-api/` 路径直接返回 HTTP 410（`OWNED_RESOURCE_REQUIRED`）。
- 生产环境对外 Web Origin 须为同源 HTTPS 且与 `quant-service` 的 `identity.public_origin` 一致，生产 Cookie 采用 `Secure`、`HttpOnly`、`SameSite=Lax` 与 `__Host-` 前缀；HTTP loopback 仅用于本机显式开发联调。

## 会话管理与私人存储隔离

[`src/auth/session.ts`](../src/auth/session.ts) 负责合并并发会话恢复与续期请求；[`src/auth/AccountGate.tsx`](../src/auth/AccountGate.tsx) 在首次进入页面时确认会话，前台每 5 分钟自动续期，并在网络恢复或标签页重新可见时校验会话状态。

- **登录与续期**：登录通过 `POST /api/v1/auth/web/login` 表单提交；`GET /api/v1/auth/session` 返回当前部署、用户、设备与权限能力；`POST /api/v1/auth/session/renew` 续期当前设备会话。
- **防跨标签页窜号**：写请求附带 `X-Requested-With: quant-web`，私人客户端请求附带 `X-Quant-User`（仅用于防止跨标签页切换账号后误提交，不可用于选择或冒充身份）。
- **状态同步与异常处理**：收到 HTTP 401 时清除私人页面状态；收到 HTTP 409 表示其他标签页已切换账号，立即重新同步身份并丢弃旧响应，不重放写操作；网络离线或身份服务 503 时保留当前页面与未保存编辑，待恢复后重新验证。
- **登出确认**：退出登录须经服务端确认撤销后才切换为匿名状态，并通过不含敏感数据的 `BroadcastChannel` 通知同源其他标签页。
- **本地存储隔离**：浏览器草稿、项目工作副本、因子配置与未确认提交均按 `deployment_id + user UUID` 隔离存储。异步写入绑定发起时的账号作用域，不会落入后续登录者名下；旧单用户本地存储键保持原样，不自动归属给首个登录账号。

## API 契约与执行权限边界

账号模式下，[`src/shared/api.ts`](../src/shared/api.ts) 将页面请求映射至 `/api/v1/client` 下的受控路由。策略文件、多文件项目、目录、回测任务、日志、归属历史以及模拟账户只读视图均由服务端按归属鉴权，列表总数同样按当前用户过滤。

- `contracts/accounts.openapi.json` 由 `quant-service` 的 `scripts/export_accounts.py` 导出。
- `contracts/api.openapi.json` 与 [`src/generated/api.d.ts`](../src/generated/api.d.ts) 由 AQ 导出生成。
- 普通协作者账号可保存自有策略代码并读取已归属资料；触发 Python 执行的创建、重试与推进请求由服务端依据 `execute_python` 权限统一裁定。
