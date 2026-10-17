# 契约与类型

| AQ 导出 | Web 契约 | 生成类型 | 消费方 |
|---|---|---|---|
| `api.openapi.json` | `contracts/api.openapi.json` | `src/generated/api.d.ts` | 执行演练、行情 |
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
