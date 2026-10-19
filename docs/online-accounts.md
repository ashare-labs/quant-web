# 已登记模拟账户

`#/accounts` 通过产品 API 的只读账户扩展展示已经结算、完成显式运行时迁移的账户。账户原有身份、申报库存、委托、成交和检查点保持其历史含义；此页面没有执行、续跑或创建交易日的操作。

本机集成入口须挂载 `GET /api/v1/online-accounts` 和 `GET /api/v1/online-accounts/{account_id}`，由 `/execution-api/` 代理访问。响应版本为 `local-online-accounts.v1`。列表返回 `accounts`，包含 account_id、label、identity、last_day、status 和 runtime_compatible。详情还返回原生 account、orders、trades、fees、head、cursor、settlement_count、review_sha256 和 limitations，且 read_only 必须为 true、next_day_authorized 必须为 false。

读取器须先逐文件核对本机登记摘要，再调用固定运行时的严格加载和报告验证；不得把目录账本伪装成历史 SQL 会话，也不得以读取失败为由创建空账户。登记不存在或核验失败时返回显式错误。浏览器离线、重新读取或切换账户时隐藏旧结果，不填充示例数据。

此扩展属于本机部署适配层，不改变 AQ 的四份冻结 HTTP 契约，也不修改执行包的运行时身份。使用通用 AQ API 启动命令而未挂载扩展时，此页面会报告未配置；正式本机入口应使用其带账户扩展的 API 命令。
