# 契约与类型

| AQ 导出 | Web 契约 | 生成类型 | 消费方 |
|---|---|---|---|
| `api.openapi.json` | `contracts/api.openapi.json` | `src/generated/api.d.ts` | 正式数据、执行演练、固定样本行情 |
| `tasks.openapi.json` | `contracts/tasks.openapi.json` | `src/generated/tasks.d.ts` | 日频任务 |
| `portfolio.openapi.json` | `contracts/portfolio.openapi.json` | `src/generated/portfolio.d.ts` | 组合回测、策略 |
| `paper.openapi.json` | `contracts/paper.openapi.json` | `src/generated/paper.d.ts` | 模拟请求契约 |

AQ 导出入口是 `python scripts/generate_contracts.py --output docs/contracts`，使用临时人工控制存储，不启动 HTTP 服务。由 AQ 维护者导出后，在 Web 根目录执行：

```sh
npm run contracts:sync -- --from "$AQ_CONTRACTS_DIR"
npm run check
```

`AQ_CONTRACTS_DIR` 指向配对 AQ 的导出目录。同步脚本先检查四份文件与 `identity.json` 的 SHA-256，再复制契约，生成同名类型和功能身份文件。`contracts/api.identity.json` 保存上游版本、源码摘要、契约摘要和 `not_reviewed` 状态；不包含机器路径。更新源码后须重新导出，不能仅改版本号。

单独重新生成和检查：

```sh
npm run contracts:generate
npm run contracts:check
npm run contracts:generate -- tasks
```

生成文件不手改。OpenAPI 规范版本为 3.1.0；`m2-jobs.v6`、`m2job-`、schema 中的 `M2` 等是 AQ 当前保留的协议标签，不能因文件改名而改写持久结果。paper 的部分返回值仍是未完整建模的 JSON；其页面用手写投影类型及运行时身份、日期和收据一致性检查，生成类型不能替代这些检查。

日频任务和 paper 核对配对源码身份及契约；portfolio 依据接口结构和所需能力接受兼容版本，但跨请求必须为同一服务身份。所有页面保留后端返回的独审状态，不将契约匹配视为新源码已通过独审。

正式数据使用 `/execution-api/product` 代理到 `/api/v1/product`：`GET /config`、`GET /catalogue?query=&limit=&offset=`、`POST /prices`、`POST /coverage` 与 `POST /releases`。行情传 `{securities,start,end,source}`；覆盖检查追加 `reference_set`（null 使用配置默认）；发布另传 `mode`，默认为 `covered_research`，诊断为 `price_only_no_limits`。覆盖响应保留 scope、ready、逐证券日期 gaps、assumptions、limitations、reference_set、source_bindings 和 coverage_sha256。config 的 reference_sets/default_reference_set 指定可选来源组，covered_research 能力不保证每个窗口有覆盖。

发布响应为 `{release,dataset}`，dataset 沿用 `PortfolioDataset` 并声明 mode/diagnostic_allowed；组合页沿用发布模式。普通发布的 release 包含公司行动日程路径与摘要、参考来源绑定和覆盖摘要，前端不能剥离转换成诊断。目录读取 `securities` 数组，行情保留真实数值字符串、缺口、逐证券覆盖和 AD 来源回执。发布覆盖检查不替代组合精确 preflight 的 assumption_ack_sha256。

AD 的开放 JSON 回执使用手写投影和运行时检查，不能凭生成类型假定数据齐全。`configuration_id` 绑定解析后的 profile、状态/数据位置及参考组与来源绑定；正式查询前后核对相同配置，组合读取及提交同时核对服务源码与配置身份。发布时间窗、实际来源及回执保存在草稿的发布信息中，供进入组合页后核对。接口或资产缺失必须清楚失败，不选择首个数据集或样例。

更新候选时由协调者统一导出 AQ 契约并同步身份，再运行整套检查与三仓真实流程；人工浏览器 fixture 和本机构建不代表正式数据联验完成。
