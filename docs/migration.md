# 功能入口迁移

这是未部署项目的一次结构调整，没有旧名兼容入口。历史证据、封存模拟包与既有数据库不属于新发布树，也不由前端迁移。

| 旧对象 | 当前入口或处理 |
|---|---|
| `Workbench.tsx`、`workbench-ui.tsx` | `features/portfolio/PortfolioPage.tsx`、`PortfolioUi.tsx`；`#/portfolio` |
| `WorkbenchEditor.tsx` | `features/strategies/StrategyEditor.tsx` |
| `Acceptance.tsx` | `features/tasks/TasksPage.tsx`；`#/tasks/daily` 与 `#/tasks/paper` |
| 固定窗口、参数、数据绑定研究页 | `DailyTaskComposer` 集中创建当前日频任务，保留窗口、参数、数据绑定和原请求确认；结果及恢复由 TasksPage 提供 |
| `BR1.tsx`、旧 M2 封存结果 | AQ 已移除对应历史接口，退出当前导航与构建；历史材料保留在原授权位置 |
| `Research.tsx` | `features/market/MarketPage.tsx`；`#/market`，自行填写已有数据集标识 |
| `LegacyApp` 中的合成运行 | `features/execution/ExecutionPage.tsx`；`#/execution/runs` |
| `Paper.tsx` | `features/paper/PaperPage.tsx`；`#/paper` |
| `m2-openapi-v3.json` 等按轮次命名的契约 | 替换为 AQ 当前四个功能契约，见[生成映射](contracts.md) |
| `contracts/backend.json` 的个人路径与旧交接 pin | 新 `api.identity.json` 保存当前 AQ 源码身份；地址通过环境变量配置 |
| `scripts/qa_*`、旧固定后端启动器 | 一次性历史实验退出；纯函数测试进 `tests/unit`，当前只读核验用 `scripts/verify-portfolio.mjs` |
| 跟踪的 `output`、过程文档与截图链接 | 整体退出当前源码和静态包；新报告写忽略的 `.local` 或明确指定的仓库外新目录 |

AQ 前缀 `/api/v1/m2` 改为 `/api/v1/tasks/daily`，`/api/v1/research` 改为 `/api/v1/market`；portfolio 与 paper 前缀保持功能含义。数据和策略管理使用配对 AQ 的 `task-*`、`tasks`、`market-*` 等命令；历史固定版本启动命令已移除。

旧固定、参数和绑定页共享的真实操作集中到新任务界面，不再连接多个按开发轮次冻结的后端。当前 daily 服务仍有自身的证券、窗口与可信代码限制；多证券由 portfolio 承接，分钟执行由 AQ 本地模块提供，没有新增浏览器分钟 API。

旧会话缓存不自动迁入。源码、运行身份、测试证据和包的版本分别记录。清理当前发布树不等于清除 Git 历史；分支、标签与最终快照发布由仓库维护者另行管理。
