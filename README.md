# QuantWeb

面向真实研究的六页前端：工作区、策略列表、策略编辑、回测结果、模拟历史、因子看板。

```sh
npm ci
npm run check
npm run build
AQ_API_URL=http://127.0.0.1:18846 PAPER_API_URL=http://127.0.0.1:18847 npm run dev
```

默认预览端口为 `41846`，仅监听本机。两个 API 地址需要指向另行配置的服务；本仓不启动后端。未指定 API 时明确显示不可用，仍可编写和保存本地草稿。没有自动连接正式端口或启动正式服务的脚本。

`npm run preview` 体验已构建的 `dist/`；传入相同环境变量。`npm run package` 生成 `.local/packages/quant-web-0.4.0.tgz` 与 SHA256。部署静态资源时需将 `/api` 反向代理至 AQ，`/paper-api` 去掉前缀后代理至 paper；未在本次部署。

现有能力、按钮映射和缺口见 [实现说明](docs/implementation.md)。Python 新回测当前受取数契约缺口限制，不会隐藏填入默认证券；因子计算和历史结果采用真实接口。草稿存于当前浏览器，清理存储前请导出代码。

设计源保持只读，使用用户提供的 QuantWeb 标志与共享样式；不包含设计稿中的账户快照和演示收益数据。
