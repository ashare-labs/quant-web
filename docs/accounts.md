# 账号模式候选接线


## 0.6.0 联合验收

已配对 quant-service 0.4.1 与 AQ 0.12.0.dev32；174 项状态／协议测试及 TypeScript 通过。合成账号经真实服务与原生 worker 完成日／分钟回测，浏览器实际显示默认沪深 300、旧结果派生比较、无基准和对数图。页面导出的 20 项 CSV 的 returns-v2、基准选择与 analysis_id 已与实际 API 核对。切页及短暂失联重连保留同一文档，刷新保持 Cookie 登录；服务端撤销后返回登录，朋友不能读取所有者结果和项目。

此次仅验证隔离候选：测试使用随机 loopback、一次性账号及构造数据，退出后已清理临时服务和状态。没有生产 HTTPS、真实账号迁移或移动端验收；没有更改收益算法与既有布局。

账号、密码、设备会话和归属检查由现有 quant-service 提供。Web 只使用同源 HttpOnly Cookie，不保存 token，不建立第二套账号，也不改收益计算或结果页布局。本候选未切换 41846，未操作真实账号、浏览器草稿、策略或历史。

## 构建与入口

设置 `QUANT_SERVICE_URL=http://127.0.0.1:显式端口` 后构建；开发／预览使用同一配置。账号包的 `quant-profile.json` 必须与预览配置一致，否则拒绝启动。该配置不能与 `AQ_API_URL`、`PAPER_API_URL` 并用。`/api` 只代理 quant-service；旧 `/paper-api/` 返回 410。

此处 loopback 是代理到私有后端的地址。用户访问的正式 Web Origin 必须是同源 HTTPS，且与 quant-service 的 `identity.public_origin` 一致；生产 Cookie 为 Secure、HttpOnly、SameSite=Lax、`__Host-` 前缀。HTTP 只用于后端显式开发模式的 loopback 合成验收。本分支不修改 HTTPS、监听范围、现有代理或 MCP 的运行配置。

没有 `QUANT_SERVICE_URL` 的构建仍是原可信单所有者配置，不能作为朋友入口。仅添加登录外观不提供边界保护；配套后端身份模式、归属迁移与旧直连入口收口必须一起验收。AQ 的 workspace header 是内部文件命名空间，不是可对外信任的身份凭据。

## 会话和私人状态

`src/auth/session.ts` 合并并发恢复／续期；`AccountGate.tsx` 在首次进入确认会话，平时保留页面，前台每五分钟续期，恢复联网／重新可见时检查会话。页面切换及新建策略／项目后沿同一文档导航，既有未保存编辑提醒保留。

- 登录使用 `POST /api/v1/auth/web/login` 表单；浏览器自行管理持久 Cookie。没有公开注册。
- `GET /api/v1/auth/session` 返回部署、本人、设备与能力；`POST /session/renew` 续期同一设备，期限由服务端控制。默认闲置 30 天、绝对 180 天，可调整。
- 写请求含 `X-Requested-With: quant-web`，私人客户端请求含 `X-Quant-User`。后者只防跨标签页错账号提交，不能选择或冒充 owner。
- 401 清除私人页面；409 表示其他标签页已更换账号，重新确认身份并丢弃原响应，不重放写操作。迟到响应按账号世代丢弃。
- 网络失败／身份服务 503 保留当前页面和编辑，恢复后重新验证；同一账号恢复不重挂编辑器。只读 `useResource` 自动重新取数，保存／提交仍须明确操作。重连后收到 401 则进入登录。
- 退出须由服务器确认撤销。网络失败不显示“已退出”；其他标签页通过不含账号数据的 BroadcastChannel 通知同步。

浏览器草稿、项目工作副本、因子状态与未确认提交按 `deployment_id + user UUID` 隔离。异步写入捕获发起账号的存储范围，不能落到后来登录者名下。旧单用户键原样保留，不给第一个登录者自动认领；生产迁移应先导出并审核，再显式导入原 owner。

## API 契约与执行边界

账号模式的 `src/shared/api.ts` 把原页面请求接到 `/api/v1/client` 的明确路由。策略文件／完整项目、目录、任务与日志、归属历史及模拟账户只读视图均由服务端鉴权，所有列表总数也按 owner 过滤。兼容层保留原提交内容和响应不确定语义，未把原始 AQ 路径开放成通用代理。

与独立收益分支合并时，原查询字符串会完整进入账号代理；后端已明确允许分析的 `analysis_version`／`benchmark` 和列表的版本参数，并核验真实版本回显。合并后从联合 AQ 导出生成契约；不直接用本分支的旧收益类型覆盖收益分支。结果页布局与收益算法不在本账号变更中。

`contracts/accounts.openapi.json` 来自 quant-service 的 `scripts/export_accounts.py`；`contracts/api.openapi.json` 与 `src/generated/api.d.ts` 来自本次 AQ workspace 候选导出，新增 `aq.strategy-workspaces.v1` 能力。账号状态只保存公开设备元数据。手机仅预留独立 Bearer 设备契约，没有移动 App。

朋友可以保存自己代码、读取已归属资料；会执行 Python 的创建／重试／跟踪推进在服务端拒绝，管理员身份也不绕过。未部署朋友沙箱前不得开放执行。原所有者仍使用原执行策略，没有新增时长、内存、数量硬限。原始引擎 HTTP／stdio MCP 只允许可信本机所有者；本阶段不发布远程 MCP。

## 验收范围

`npm run check` 包含会话单飞、离线保留、401／迟到响应、真实登出确认及跨账号存储测试；`npm run package` 校验 TypeScript 与账号构建。后端另有合成双用户 HTTP、并发续期与撤销、越权任务／路径、迁移副本和朋友执行拒绝测试。

浏览器候选使用真实 quant-service 身份／SQLite 与真实 AQ 文件／项目 API、一次性合成账号、随机 loopback 端口；不连接生产服务、不运行数值引擎或市场数据。具体结果记录在本任务验收报告。原文档中的历史数值回测证据不能视为新账号入口的本轮联合验收；真实数据迁移、生产入口与全链路本人回测待协调部署后确认。
