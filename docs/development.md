# 开发与验证

源码按功能组织：`src/app` 管路由，`src/features` 放 product、portfolio、strategies、tasks、paper、execution、market；`src/shared` 只放跨功能运行能力，`src/generated` 只放生成类型。开发命令统一在根目录 `scripts`。

```sh
npm ci
npm run check
npm run build
npm run package
```

`check` 运行严格 TypeScript 检查（包含所有业务模块和 `tests/types` 的错误调用断言）、命名与路径边界检查、文档链接检查、契约生成一致性和单元测试。`build` 校验并构建静态资源，检查本机路径没有进入公开 JS。`package` 验证 `.local/packages/quant-web-0.2.0.tgz` 的白名单与解包后资源；这是静态交付包，开发依赖从源码安装。

构建生成 `dist/release.json`，记录前端版本、当前源码快照摘要、配对 AQ 版本与源码摘要。摘要覆盖源码、契约、脚本、测试、文档和根构建配置，不包含 Git 元数据或本机状态；在干净源码副本中可重复得到。独审状态始终为 `not_reviewed`，本机测试不改写历史验收。

`src` 只接受 TypeScript/TSX；不得用 `allowJs` 绕过业务类型检查。根 `scripts` 和 Node 单元测试保留原生 ESM `.mjs`，直接测试迁移后的 `.ts` 模块。

`tests/fixtures` 仅包含人工构造的最小边界样例，每次测试创建独立对象。不复制真实市场输入、账户、数据库、历史 PID、运行日志或封存结果。测试不依赖 `output`、原验收工作树或旧服务状态。

正式入口的人工浏览器流程可在两个独立终端运行（端口须空闲）：

```sh
node tests/fixtures/product-server.mjs 18949
```

```sh
ASHARE_API_URL=http://127.0.0.1:18949 FRONTEND_PORT=41949 npm run dev
```

在独立浏览器打开 41949，按[正式数据流程](data.md)选择三只人工证券、日期、读取、确认并发布，注册策略和预检查后创建请求。fixture 不运行引擎；它仅记录前端请求与展示排队任务。用早于 2023 年的窗口核对缺口路径；`POST /__test/environment` 切换人工配置身份，可检查草稿阻断。结束后关闭两个测试进程。真实市场来源、worker 执行和恢复仍须配对 AQ/AD 联验。

对已单独准备的隔离组合服务，可以只读核验并将报告写到新目录：

```sh
npm run verify:portfolio -- http://127.0.0.1:18839 .local/portfolio-check
```

父目录须存在，目标目录必须是新的。此脚本不启动或取消任务。生成报告含该服务的任务响应，应留在本机授权位置。人工检查响应式页面时，在已运行的开发服务打开 `/scripts/responsive.html`；默认提供 390 和 1024 像素视口。

发布前还需配对 AQ/AD 候选联验：创建任务、重复提交原幂等请求、取消/恢复、数据绑定变更、错误与离线状态、paper 同一账户接续、逐日与逐笔结果，以及桌面和窄屏可用性。静态构建和人工 fixture 测试不代替这些联验；新版未继承任何旧验收结论。


## 修改页面时从哪里开始

页面文件负责组合视图；请求、持久化和并发状态留在对应功能的 hook 中。组合页的 controller 持续挂载，因此在策略、编辑器、列表与结果间切换时，草稿和各自的搜索条件仍然保留。

| 目的 | 实现位置 |
|---|---|
| 正式主库目录、价格、发布交接 | `src/features/product`；共用配置身份在 `src/shared/product-config.ts` |
| 组合页路由与视图组合 | [PortfolioPage](../src/features/portfolio/PortfolioPage.tsx)、[controller](../src/features/portfolio/usePortfolioController.ts) |
| 草稿恢复、自动保存与范围变更 | [draft](../src/features/portfolio/draft.ts)、[usePortfolioDraft](../src/features/portfolio/usePortfolioDraft.ts) |
| 读取轮询、预检查与服务身份 | [usePortfolioSnapshot](../src/features/portfolio/usePortfolioSnapshot.ts)、[usePortfolioPreflight](../src/features/portfolio/usePortfolioPreflight.ts) |
| 跨标签页请求记录、提交和原请求重试 | [usePortfolioOperation](../src/features/portfolio/usePortfolioOperation.ts)、[usePortfolioActions](../src/features/portfolio/usePortfolioActions.ts) |
| 策略定义、运行设置、列表与结果 | `PortfolioDefinition`、`PortfolioRunSettings`、`PortfolioLists`、`PortfolioRun`；指标与曲线在 `PortfolioOverview` |
| 组合页样式 | [portfolio.css](../src/features/portfolio/portfolio.css) 统一导入 `styles`：基础、导航、编辑器、列表、结果、共享反馈和研究说明；媒体规则归属相同视图 |
| 日频与模拟快照 | [useTasksController](../src/features/tasks/useTasksController.ts)、`TaskOverview`、`TaskEvidenceTabs`；创建表单使用 `useDailyTaskComposer` |
| 连续模拟 | [usePaperController](../src/features/paper/usePaperController.ts)、`PaperScope`、`PaperControls`、`PaperEvidence` |
| 执行演练与行情 | `RunForm`、`RunDetail`、`RunProjection`、`RunEvidence`；行情请求在 `useMarketQuery`，响应在 `MarketResults` |

改变数据范围必须清除预检查确认。提交前先保存冻结请求；不确定响应保留原幂等键；重连和重试必须重新核对服务身份。样式拆分需要核对同一数据下的计算样式、元素位置和响应式视口，尤其注意共享规则与具体组件规则的覆盖顺序。浏览器截图与 API 回归产物存入忽略的 `.local`，不提交到仓库。
