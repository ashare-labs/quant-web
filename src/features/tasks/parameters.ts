import type { JsonValue } from "../../shared/json.ts";
import type { Task } from "./api";

export type ParameterDraft = {
  template: string;
  security: string;
  frequency: string;
  initial_cash: unknown;
  strategy_version_id?: string;
  strategy_parameters?: JsonValue;
  target_shares?: number;
  enter_below?: unknown;
  exit_above?: unknown;
};
export type CreationDraft = {
  window_id: string;
  end_date?: string;
  name: string;
  acknowledged: boolean;
  parameters: ParameterDraft;
};

// Input validation only. Decisions, account balances and results belong to AQ.
export function decimal(value: unknown, places = 2): string {
  if (typeof value !== "string" || value.length > 12)
    throw new Error("金额和阈值必须是长度不超过12的十进制字符串。");
  const match = value.match(
    new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${places}})?$`),
  );
  if (!match || match[0] !== value)
    throw new Error(`只接受普通十进制，最多${places}位小数。`);
  const [integer, fraction = ""] = value.split(".");
  const tail = fraction.replace(/0+$/, "");
  return integer + (tail ? "." + tail : "");
}
export function compareDecimal(a: string, b: string) {
  const [ai, af = ""] = a.split("."),
    [bi, bf = ""] = b.split(".");
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const length = Math.max(af.length, bf.length),
    left = af.padEnd(length, "0"),
    right = bf.padEnd(length, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}
export function normalizeParameters(
  input: ParameterDraft,
  limits: Task<"ParameterLimits">,
): Task<"JobCreate">["parameters"] {
  if (input.security !== "600000.XSHG" || input.frequency !== "1d")
    throw new Error("当前日频任务只支持 600000.XSHG 和日频。");
  const initial_cash = decimal(
    input.initial_cash,
    limits.maximum_decimal_places,
  );
  if (compareDecimal(initial_cash, limits.initial_cash_min) < 0)
    throw new Error(`初始资金不得小于 ${limits.initial_cash_min}。`);
  if (
    input.template === "registered_rules.v1" ||
    input.template === "registered_python.v1"
  ) {
    if (!/^[a-f0-9]{64}$/.test(input.strategy_version_id ?? ""))
      throw new Error("请选择已注册的策略版本。");
    const common = {
      security: input.security,
      frequency: input.frequency,
      initial_cash,
      strategy_version_id: input.strategy_version_id!,
    } as const;
    if (input.template === "registered_python.v1") {
      if (
        !input.strategy_parameters ||
        typeof input.strategy_parameters !== "object" ||
        Array.isArray(input.strategy_parameters)
      )
        throw new Error("Python 参数必须是 JSON 对象。");
      return {
        ...common,
        template: input.template,
        strategy_parameters: structuredClone(input.strategy_parameters),
      };
    }
    return { ...common, template: input.template };
  }
  if (input.template !== "previous_close_band.v1")
    throw new Error("未知策略模板。");
  const enter_below = decimal(input.enter_below, limits.maximum_decimal_places),
    exit_above = decimal(input.exit_above, limits.maximum_decimal_places);
  if (
    typeof input.target_shares !== "number" ||
    !Number.isSafeInteger(input.target_shares) ||
    input.target_shares < limits.target_shares_min ||
    input.target_shares > limits.target_shares_max ||
    input.target_shares % limits.target_shares_multiple_of !== 0
  )
    throw new Error("目标股数必须符合当前目录中的整数范围和整手要求。");
  if (
    compareDecimal(enter_below, "0") <= 0 ||
    compareDecimal(enter_below, exit_above) >= 0
  )
    throw new Error("阈值必须满足 0 < 买入阈值 < 卖出阈值。");
  return {
    template: input.template,
    security: input.security,
    frequency: input.frequency,
    initial_cash,
    target_shares: input.target_shares,
    enter_below,
    exit_above,
  };
}
export function createRequest(
  catalogue: Task<"JobCatalogue">,
  input: CreationDraft,
  key: string,
): Task<"JobCreate"> {
  if (
    !catalogue.configured ||
    !catalogue.native_ready ||
    !/^[a-f0-9]{64}$/.test(catalogue.data_binding_sha256 ?? "")
  )
    throw new Error("数据绑定与原生执行器尚未就绪。");
  const window = catalogue.windows.find(
    (item) => item.scope.window_id === input.window_id,
  );
  if (!window || !input.acknowledged)
    throw new Error("请选择当前窗口并确认其假设。");
  if (input.end_date && !window.scope.trading_dates.includes(input.end_date))
    throw new Error("结束日期必须来自窗口的交易日列表。");
  const name = input.name.trim();
  if (!name || name.length > 80 || /[\r\n]/.test(name))
    throw new Error("任务名称须为1–80字的单行文本。");
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(key)) throw new Error("请求标识无效。");
  return {
    window_id: window.scope.window_id,
    end_date: input.end_date || null,
    name,
    idempotency_key: key,
    assumption_ack_sha256: window.assumption_ack_sha256,
    data_binding_sha256: catalogue.data_binding_sha256!,
    parameters: normalizeParameters(
      input.parameters,
      catalogue.parameter_limits,
    ),
  };
}
