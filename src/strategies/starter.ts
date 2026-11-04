// An opt-in starting point, never applied to existing files or historical source.
export const OBSERVATION_TEMPLATE = `# 入门观察模板：记录账户净值，不提交买卖订单。
# 日期请按真实数据覆盖填写；此模板不保证当前数据具备完整回测条件。
from aquant import g, run_daily, set_benchmark, record


def initialize(context):
    # 关闭默认基准，避免把缺失的指数数据当作有效比较结果。
    set_benchmark(None)
    # 可在右侧“策略参数”中填写 {"record_equity": true}。
    g.record_equity = context.parameters.get("record_equity", True)
    run_daily(observe, time="after_close")


def observe(context):
    if g.record_equity:
        record(equity=context.portfolio.total_value)
`;
