# 六页与接口

| 顺序 | 页面 | 入口 | 已实现能力 |
| --- | --- | --- | --- |
| 1 | 入口总览 | index.html | 三个模块导航、服务连接状态 |
| 2 | 策略列表 | strategies.html | 搜索、新建空白草稿、同名后缀、本地文件夹、历史策略/回测读取 |
| 3 | 策略编辑 | strategy-editor.html | Python 编辑、导入导出、本地保存，开始/结束日期与初始资金同页；历史源码只读 |
| 4 | 历史回测结果 | backtest-results.html | 状态、权益、成交、持仓、日志、取消、可读 CSV 与诊断 JSON |
| 5 | 模拟策略列表 | simulations.html | 既有会话列表/状态筛选/历史记录；写操作不可用 |
| 6 | 因子看板 | factors.html | 目录分类/来源筛选/搜索/排序/分页，定义详情，真实来源/证券/日期计算评价，日志、取消、刷新找回、导出 |

接口基线是 AQ `ff13387c1f642a9b61f3649a49acd6295c2c1a8a`。使用生成的 TypeScript 契约；`contracts/api.openapi.json` 与 `contracts/paper.openapi.json` 为该候选导出。

| 用户操作 | API 或存储 |
| --- | --- |
| 新建、保存、文件夹 | 浏览器本地存储，界面明确说明不与服务同步 |
| 历史策略、源码 | GET /api/v1/history/strategies，或 /history/jobs/{id}/manifest |
| 历史回测列表、结果、日志 | GET /api/v1/history/jobs，/{id}、/result、/logs |
| 当前 Python 状态、取消 | GET /api/v1/python/jobs/{id}；POST /{id}/cancel |
| 因子目录、数据来源 | GET /api/v1/factors/catalogue、/sources |
| 因子计算评价 | POST /api/v1/factors/jobs；必须明确填写证券、来源和日期 |
| 因子状态、取消、结果 | GET /factors/jobs/{id}、/logs、/result；POST /cancel |
| 模拟历史 | 独立 paper API GET /api/v1/paper/capabilities、/sessions、/{id}/view |

## 明确缺口

- PythonCreate 仍要求外部 `securities`，尚不支持从 Python 取数接口声明证券/字段。本版“开始回测”保持不可用，不发送默认两股、旧 JSON、源码模板或隐式同意。配置只有起止日期和初始资金。服务端支持日频/分钟执行本身不等于这个交互契约已满足。
- 无服务端草稿、文件夹、重命名、策略删除端点。仅本地草稿可编辑与同名编号；历史策略只读，未调用删除。
- paper 创建/推进/暂停/恢复已退役，页面不把本地记录冒充运行中的模拟交易。
- 指数历史成分池、稿件里的组合回测/交易过滤/预计算全目录 IC 排名无对应接口。不复制稿件的历史账户数据；列表 IC/IR 不伪造，所选真实任务的统计评价可读。
- 任意 Python 内存不能断点续跑；无假恢复按钮。状态优先使用 display_status；retired/runtime_unavailable 不展示为等待运行。
- 普通结果使用当前可见表 CSV；原服务响应只在“诊断 JSON”导出，不另造普通 JSON 格式。基准收益、Alpha、Beta、Sharpe 未提供时为“—”，不能记零。

## 实现边界

六页采用同一 React/TypeScript 入口和共用样式，产物为六个独立 HTML 入口及静态资源。不保留旧演练平台页面、七策略注册和旧 portfolio/daily API。后端实现不在本仓修改范围。

策略编辑只保留左侧“保存”，统一保存源码及全部配置字段。草稿允许暂缺日期或资金；已填值仍检查日期合法性、上海时间的今天上限、起止顺序，以及资金大于 0 且不超过 1 亿元。原生日历、手工输入、保存与完整配置校验共用日期规则。今天可选只代表日期合法，不代表当天行情完整或已有数据。

新建策略默认初始资金为人民币 100,000，日期不预填；已存草稿（包括空白金额）原样读取。金额输入以逗号分组显示，存储保留未分组的数字文本及小数，完整配置校验返回实际数值。`validateConfig` 保留提交前的完整性检查；开始回测仍因取数契约缺口禁用。
