# QuantWeb

面向真实研究的前端：工作区、策略列表、策略编辑、某策略的回测列表、单次回测结果、模拟历史、因子看板。本仓只提供页面，不启动 AQ、paper 或账号后端。

需要 Node.js 22.18 及以上。

```sh
npm ci
npm run check
npm run build
# 下列地址是本仓候选默认，见下方端口表
AQ_API_URL=http://127.0.0.1:18846 PAPER_API_URL=http://127.0.0.1:18847 npm run dev
```

`npm run dev` 与 `npm run preview` 监听 `127.0.0.1:41846`。开发命令只使用你传入的地址。未设置 API 时页面标明服务不可用；编辑器仍可编写和导出，服务端保存未成功时页面保持未保存。

账号模式只设置 `QUANT_SERVICE_URL`（显式本机回环地址），与 `AQ_API_URL`、`PAPER_API_URL` 互斥。见 [账号模式](docs/accounts.md)。

`npm run preview` 使用已构建的 `dist/`，环境变量与开发相同。`npm run package` 按 `package.json` 当前版本 **0.6.2** 生成 `.local/packages/quant-web-0.6.2.tgz` 与同名 `.sha256`。静态部署时把 `/api` 反代到 AQ，`/paper-api` 去掉前缀后反代到 paper。

## 端口

正在使用的正式入口以本机工作区的 `ASHARE.md` 与 `ashare-local/README.md` 为准。下表只列这一处对照：左侧是 `ashare-local` 在本机的正式端口，右侧是本仓文档和开发命令里的候选默认。

| 用途 | 正式（ashare-local） | 本仓候选默认 |
| --- | --- | --- |
| API（AQ） | 18839 | 18846（`AQ_API_URL` 或 `ASHARE_API_URL`） |
| Web | 41839 | 41846（`FRONTEND_PORT`，仅本机） |
| Paper | 常为 18818 | 18847（`PAPER_API_URL` 或 `ASHARE_PAPER_URL`） |

## 继续读

页面能力、按钮和缺口见 [实现说明](docs/implementation.md)，收益页见 [结果分析](docs/result-analysis.md)。版本配对见 [变更记录](CHANGELOG.md)。
