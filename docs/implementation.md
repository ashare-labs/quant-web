# 页面与接口实现说明

账号模式接线详见 [账号模式说明](accounts.md)：显式 `QUANT_SERVICE_URL` 构建通过 `quant-service` 的 `/api/v1/client` 访问归属资源，支持 Cookie 会话、跨账号草稿隔离与同文档导航；未设置 `QUANT_SERVICE_URL` 时采用单所有者直连 AQ / paper 模式。工作空间与收益契约已同步 `contracts/api.openapi.json` 及生成类型，身份契约保存在 `contracts/accounts.openapi.json`。

| 顺序 | 页面 | 入口 | 核心能力 |
| --- | --- | --- | --- |
| 1 | 入口总览 | `index.html` | 三个模块导航、服务连接状态 |
| 2 | 策略列表 | `strategies.html` | 分类目录导航、搜索、新建单文件/策略项目/文件夹、服务端读取 |
| 3 | 策略编辑 | `strategy-editor.html` | Python 高亮编辑、项目文件树、导入导出、完整源码保存，开始/结束日期、初始资金与运行频率同页；历史源码只读 |
| 4 | 历史回测结果 | `backtest-results.html` | 状态、权益、成交、持仓、日志、取消、可读 CSV 与诊断 JSON |
| 5 | 模拟策略列表 | `simulations.html` | 既有会话列表/状态筛选/历史记录；写操作只读禁用 |
| 6 | 因子看板 | `factors.html` | 目录分类/来源筛选/搜索/排序/分页，定义详情，真实来源/证券/日期计算评价，日志、取消、刷新找回、导出 |
| 7 | 当前策略的回测列表 | `backtests.html` | 按完整策略身份查询全部运行、搜索、分页、可选列、冻结结果/源码对比、回到策略和单次结果 |

接口契约与 AQ 导出的 `contracts/api.openapi.json` 一致，TypeScript 契约通过 `npm run contracts:generate` 生成。旧服务缺少对应契约时明确报错，不当作空记录处理。

结果页在任务发布身份到达后直接读取收益分析，完整冻结明细按交易/持仓页签和日志/诊断展开状态按需加载。页面读取具备真实阶段、接收字节数、60 秒有限等待、取消与重试能力；离页中止请求，后退恢复时重新读取，详见 [结果分析说明](result-analysis.md)。

## 收益概述 v2

结果页与对比页请求 `/jobs/{id}/result/analysis?analysis_version=returns-v2&benchmark=frozen`；列表请求同一版本并验证响应回显。保留 20 项核心指标与收益、日盈亏、每日买卖三联图，不在浏览器端另算新指标。主超额、曲线和超额回撤使用后端相对净值定义；Alpha、Beta、日均主动收益与信息比率保持各自定义，超额夏普明确为信息比率同义项。

比较基准选项来自任务已固定的数据发布。默认查看原始基准，可切换指数或无基准；切换时仅发送 GET 请求获取新派生分析，核对任务、结果摘要、版本及 `selection`，不写回原冻结输入、结果、成交或权益。新建回测默认沪深 300 由引擎承担，策略 `initialize` 可覆盖或通过 `set_benchmark(None)` 关闭；前端不修改用户源码。

三条曲线图例可独立显隐，共用日期范围、缩放与提示；策略与超额最大回撤高亮使用后端峰谷日期。对数轴绘制正净值、标签显示收益率，净值含零时禁用。缺基期、缺日、未选和显式关闭分别给出说明；无闭合交易不填胜率。CSV 导出保持 20 项指标并附带计算版本、比较选择与分析身份。

## 核心操作与 API 映射

| 用户操作 | API 或存储 |
| --- | --- |
| 列出目录/文件、新建文件夹 | `GET /api/v1/python/directories?path=`；`POST /api/v1/python/directories` `{path}` |
| 打开源码 | `GET /api/v1/python/files?path=` |
| 新建空文件、保存源码 | `PUT /api/v1/python/files` `{path, source, overwrite}` |
| 创建、读取、保存项目 | `POST/GET/PUT /api/v1/python/projects`；GET 可用 `path` 或 `strategy_id`；PUT 包含 `expected_revision` |
| 项目改名或移动 | `POST /api/v1/python/projects/move`；保持稳定 `strategy_id` |
| 当前未保存源码、名称、日期、资金和运行频率 | 同一条浏览器 Draft；按完整文件路径或草稿 ID 恢复；不冒充服务端已保存内容 |
| 结果页对应源码 | `GET /api/v1/history/jobs/{id}/manifest` |
| 独立回测结果、日志 | `GET /api/v1/history/jobs/{id}`、`/{id}/result`、`/{id}/logs` |
| 某策略全部回测 | `GET /api/v1/python/backtests?strategy_id=相对路径或稳定项目ID&limit=100&offset=0` |
| 创建 Python 回测 | `GET /api/v1/python/catalogue`；`POST /api/v1/python/jobs`，显式 `frequency`；不发送外部 `securities` 或 `warmup_sessions` |
| 当前 Python 状态、取消 | `GET /api/v1/python/jobs/{id}`；`POST /{id}/cancel` |
| 因子目录、数据来源 | `GET /api/v1/factors/catalogue`、`/sources` |
| 因子计算评价 | `POST /api/v1/factors/jobs`；必须明确填写证券、来源和日期 |
| 因子状态、取消、结果 | `GET /factors/jobs/{id}`、`/logs`、`/result`；`POST /cancel` |
| 模拟历史 | 独立 paper API `GET /api/v1/paper/capabilities`、`/sessions`、`/{id}/view` |

## 明确边界与缺口说明

- 单文件接口仅存储 Python 源码，不提供文件重命名或删除；多文件项目接口支持整体改名移动及内部文件编辑。两种模式均不在服务端存储回测日期、资金或频率参数。目录响应不含修改时间，列表统一显示“—”。
- paper 创建/推进/暂停/恢复已退役，页面仅提供历史会话只读查看。
- 列表 IC/IR 不伪造预计算全目录排名，仅展示所选真实任务的统计评价。
- 状态展示优先使用 `display_status`；`retired` 与 `runtime_unavailable` 不展示为等待运行。
- 普通结果导出当前可见表格 CSV；原始服务响应通过“诊断 JSON”导出。基准收益、Alpha、Beta、Sharpe 未提供时显示“—”，不以 0 替代。

## 策略所属回测列表与对比

单文件策略的 `strategy_id` 身份模型为 `saved_relative_path`（完整相对路径），多文件策略项目为 `stable_project_id`。不同目录的同名文件互不合并；尚未保存的纯浏览器草稿可提交回测但保持未归属状态。

回测列表仅发送带显式 `strategy_id` 的 `/python/backtests` 请求，不从名称、源码哈希或 `localStorage` 猜测归属。响应及每行身份必须与选中策略一致；跨页加载直至 `total`，若出现数量变化、缺页、重复 ID 或混入其他策略则直接报错。全部结果载入后按创建时间倒序展示，支持页内搜索与分页（每页 20 条），运行中任务每 5 秒轮询刷新。

勾选 2 至 6 条记录可进行冻结结果与派生分析并列对比，复用收益页的 `acceptedAnalysis` / `resultMetrics` 按 20 项指标顺序展示，并核对任务 ID 与列表 `result.snapshot_sha256`。恰好勾选 2 条记录时可读取冻结 manifest 并按文件逐一对比源码。

## 文件保存、别名恢复与多文件策略项目

### 单文件保存与规范路径别名

服务端文件以相对路径寻址，编辑器使用 `?file=` 打开关联文件，`?draft=` 打开浏览器草稿，`?job=` 只读查看冻结历史源码。`GET/PUT` 文件响应须同时返回安全的相对 `.py` 路径且 `path === strategy_id`。若存在原别名草稿，在一次原子存储操作中保留原 ID、源码、名称和回测参数，移除文件绑定并记录 `aliasSourcePath`，作为独立浏览器草稿保留在规范目录中。

新建策略立即 `PUT` 空 `.py`（`overwrite=false`），打开已有文件后保存传 `overwrite=true`。仅当 `PUT` 成功后才将当前 Draft 标记为已保存；网络中断、响应异常或 `STRATEGY_SAVE_UNCERTAIN` 会重新 `GET` 核对，不会冒充落盘已确认，也不自动重试写入。

### 多文件策略项目

策略列表区分可嵌套分类文件夹、不可嵌套策略项目与单文件策略。新建项目默认创建 `main.py`，通过 `strategy-editor.html?project=aqproj-…` 进入编辑器。编辑器采用 `ace-builds` 提供 Python/TOML 语法高亮，支持在项目内添加、改名/移动、删除 `.py` 文件及切换入口文件；`aquant.toml` 仅展示格式版本、稳定项目身份与入口路径。

完整浏览器工作副本按稳定项目身份保留 `files`、入口、原始 `revision`、当前文件与运行参数。保存时通过 `expected_revision` 防止静默覆盖；当服务端版本变化时保留本地源码并标出冲突，由用户核对文件差异后选择服务端版本或保留当前编辑再保存。开始回测时提交完整 `project={project_id, entrypoint, files}` 与 `strategy_id`，所有项目文件、入口及回测参数均纳入幂等内容签名。

## 运行频率、回测提交与资源契约

- **运行频率**：编辑器在初始资金与 Python3 标记之间提供原生频率选择框（“分钟”对应 `1m`，“日”对应 `1d`），新建草稿默认选中 `1m`，历史只读页使用 `manifest.request.frequency`（缺失时显示“未记录”）。`src/shared/drafts.ts` 中的 `pythonBacktestConfig(draft)` 负责校验完整日期、资金和显式频率。
- **`aquant` 策略导入**：编辑器默认提示 `from aquant import *`（同时支持命名导入与 `import aquant as api`）。旧 `jqdata` 入口提交会返回 `AQUANT_LEGACY_IMPORT`，编辑器不静默改写用户源码。
- **幂等提交**：点击“开始回测”始终从当前草稿校验并构造请求；仅当完整请求内容与上次未确认提交完全相同时才复用幂等键防止网络丢包重复创建，确认接受或拒绝后即清除幂等键。
- **研究范围与预算**：初始资金上限为 100 亿元（`10,000,000,000`）；因子证券列表只要求非空、唯一与合法标识，`min_assets` 为不少于 2 的整数，不设证券数或日历跨度硬上限。客户端完整解析分块 JSON 响应，并以 `catalogue` 返回的 `resource_budget` 提示资源预算。
