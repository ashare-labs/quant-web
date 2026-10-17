# 开发与验证

源码按功能组织：`src/app` 管路由，`src/features` 放 portfolio、strategies、tasks、paper、execution、market；`src/shared` 只放跨功能运行能力，`src/generated` 只放生成类型。开发命令统一在根目录 `scripts`。

```sh
npm ci
npm run check
npm run build
npm run package
```

`check` 运行 TypeScript、命名与路径边界检查、文档链接检查、契约生成一致性和单元测试。`build` 校验并构建静态资源，检查本机路径没有进入公开 JS。`package` 验证 `.local/packages/quant-web-0.2.0.tgz` 的白名单与解包后资源；这是静态交付包，开发依赖从源码安装。

构建生成 `dist/release.json`，记录前端版本、当前源码快照摘要、配对 AQ 版本与源码摘要。摘要覆盖源码、契约、脚本、测试、文档和根构建配置，不包含 Git 元数据或本机状态；在干净源码副本中可重复得到。独审状态始终为 `not_reviewed`，本机测试不改写历史验收。

`tests/fixtures` 仅包含人工构造的最小边界样例，每次测试创建独立对象。不复制真实市场输入、账户、数据库、历史 PID、运行日志或封存结果。测试不依赖 `output`、原验收工作树或旧服务状态。

对已单独准备的隔离组合服务，可以只读核验并将报告写到新目录：

```sh
npm run verify:portfolio -- http://127.0.0.1:18839 .local/portfolio-check
```

父目录须存在，目标目录必须是新的。此脚本不启动或取消任务。生成报告含该服务的任务响应，应留在本机授权位置。人工检查响应式页面时，在已运行的开发服务打开 `/scripts/responsive.html`；默认提供 390 和 1024 像素视口。

发布前还需配对 AQ/AD 候选联验：创建任务、重复提交原幂等请求、取消/恢复、数据绑定变更、错误与离线状态、paper 同一账户接续、逐日与逐笔结果，以及桌面和窄屏可用性。静态构建和人工 fixture 测试不代替这些联验；新版未继承任何旧验收结论。
