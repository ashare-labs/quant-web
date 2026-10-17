# 贡献约定

按功能组织实现，业务名与 AQ/AD 共用 backtests、strategies、portfolio、execution、paper、tasks、market、reference、corporate_actions、financials、factors、storage、providers 等概念。各仓保留自身语言与构建惯例，不强求同一目录树。

- React 组件为 PascalCase，hooks 为 `useXxx`；其余前端目录、普通 TS 模块、非 Python 脚本、文档为 kebab-case。业务模块统一使用严格检查的 TypeScript，Node 开发脚本和测试可保留 `.mjs`。Python 包、模块、脚本为 snake_case。
- 根 `scripts` 是开发脚本入口；`tests` 保存测试与最小人工 fixtures；`docs` 只放当前指南、参考和必要迁移说明；只有可直接运行的当前示例才进 `examples`。
- 产品代码不导入测试、历史报告或开发脚本。跨功能能力先提到 shared；不为阶段名称增加兼容 shim 或档案目录。
- 契约与生成类型同 stem，生成文件不手改。持久协议标签、历史回执与独审事实不随源码更名而改写。
- 不提交个人路径、凭据、数据库、真实原始资料、运行状态或历史验收产物；新测试使用隔离目录。明确区分缺失、零值、拒绝和成功。

改动后运行 `npm run check`；影响构建或公开资源时运行 `npm run build`，交付前运行 `npm run package`。涉及 AQ 接口时同步[契约](docs/contracts.md)，并说明新候选实际完成与尚未完成的联验。命名整理不授予历史验收结论。
