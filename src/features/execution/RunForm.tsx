import { useRef, useState, type FormEvent } from "react";
import { api, ApiError, errorText, PIN, type Model } from "./api";

import { ErrorBox, Json, Pairs } from "./ExecutionUi";
import {
  labels,
  record,
  type Bootstrap,
  type Engine,
  type Run,
  type Scenario,
  type Strategy,
} from "./model";
type Attempt = {
  pin: string;
  key: string;
  definition: Model<"StrategyCreate">;
  account: string;
  outcome: "unknown" | "rejected" | "created";
  run?: Run;
  error?: string;
};
const storageKey = "quant-web.execution.attempt.v3";
function restore(): Attempt | undefined {
  try {
    const x = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    return x?.pin === PIN && x.definition && typeof x.key === "string"
      ? x
      : undefined;
  } catch {
    return undefined;
  }
}
export function RunForm({
  boot,
  enabled,
  onCreated,
}: {
  boot?: Bootstrap;
  enabled: boolean;
  onCreated: () => void;
}) {
  const [attempt, setAttempt] = useState<Attempt | undefined>(restore);
  const [engine, setEngine] = useState<Engine>(
    attempt?.definition.engine_id || "rqalpha",
  );
  const [scenario, setScenario] = useState<Scenario>(
    attempt?.definition.scenario || "buy_hold",
  );
  const [name, setName] = useState(attempt?.definition.name || "买入持有演练");
  const [description, setDescription] = useState(
    attempt?.definition.description || "",
  );
  const [account, setAccount] = useState(attempt?.account || "web-demo");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string>();
  const scenarios =
    engine === "rqalpha" ? boot?.nativeScenarios : boot?.scenarios;
  const spec = record(scenarios?.[scenario]);
  const params = record(spec.parameters);
  function save(value: Attempt) {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
    setAttempt(value);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !enabled || attempt?.outcome === "created") return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    let next: Attempt | undefined;
    try {
      next = attempt
        ? { ...attempt, outcome: "unknown", error: undefined }
        : {
            pin: PIN,
            key: `web-${crypto.randomUUID()}`,
            definition: {
              engine_id: engine,
              name: name.trim(),
              scenario,
              description,
            },
            account,
            outcome: "unknown",
          };
      save(next); // Persist before any mutation: reload/retry always reuses this exact request.
      const strategy = await api<Strategy>("/strategies", next.definition);
      const run = await api<Run>("/runs", {
        strategy_version_id: strategy.version_id,
        account_id: next.account,
        engine_id: next.definition.engine_id,
        mode: next.definition.engine_id === "rqalpha" ? "synthetic" : "fixture",
        idempotency_key: next.key,
      } satisfies Model<"RunCreate">);
      save({ ...next, outcome: "created", run });
      location.hash = `/execution/runs/${encodeURIComponent(run.run_id)}`;
      onCreated();
    } catch (e) {
      const text = errorText(e);
      setError(text);
      if (next) {
        try {
          save({
            ...next,
            outcome:
              e instanceof ApiError && !e.uncertain ? "rejected" : "unknown",
            error: text,
          });
        } catch {
          setError(
            "无法保存本次请求到 sessionStorage。为避免重复运行，提交已中止；请允许本地站点存储后重试。",
          );
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function reset() {
    try {
      sessionStorage.removeItem(storageKey);
      setAttempt(undefined);
      setError(undefined);
    } catch {
      setError("无法清理本地请求记录。");
    }
  }
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <span className="kicker">01 / 新建演练</span>
          <h2>人工策略样例</h2>
        </div>
        <span className="tag">SYNTHETIC</span>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy || !!attempt}>
          <label>
            执行引擎
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as Engine)}
            >
              <option value="rqalpha">原生 RQAlpha · 合成数据</option>
              <option value="fixture-replay-v1">
                测试替身 fixture · 合成回放
              </option>
            </select>
          </label>
          <label>
            样例
            <select
              value={scenario}
              onChange={(e) => {
                const s = e.target.value as Scenario;
                setScenario(s);
                setName(`${labels[s]}演练`);
              }}
            >
              {Object.entries(labels).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  disabled={!!boot && !(value in (scenarios || {}))}
                >
                  {label} · {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            规格名称
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            虚拟演练账户
            <input
              required
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.:\-]{0,95}"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
            <small>仅作为并发互斥标识；每次运行重新使用样例初始资金。</small>
          </label>
          <label>
            说明（可选）
            <textarea
              maxLength={2000}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </fieldset>
        <div className="fixed-params">
          <h3>
            后端固定参数 <span>只读</span>
          </h3>
          {Object.keys(params).length ? (
            <Pairs value={params} />
          ) : (
            <p>正在等待后端样例参数…</p>
          )}
          <small>当前接口不接受参数编辑或策略代码。</small>
        </div>
        <details>
          <summary>人工预期与样例假设（非实测）</summary>
          <Json value={spec} />
        </details>
        {scenario === "restart" && (
          <p className="notice">
            该样例用于恢复验证；浏览器不注入崩溃或重启进程。正确 CLI worker
            可接管可恢复任务；真实市场恢复仍未验证。
          </p>
        )}
        <ErrorBox text={error || attempt?.error} />
        {attempt && (
          <div className="attempt">
            <small>当前请求幂等键</small>
            <code>{attempt.key}</code>
            {attempt.outcome === "created" ? (
              <p role="status">
                已创建合成运行。再次点击或刷新不会新建任务。
                <a href={`#/execution/runs/${attempt.run?.run_id}`}>
                  查看本次运行 →
                </a>
              </p>
            ) : (
              <p>
                请求已锁定，重试沿用同一键和参数。
                {attempt.outcome === "unknown" &&
                  "结果待确认，暂不允许另起请求。"}
              </p>
            )}
          </div>
        )}
        <button
          className="primary wide"
          type="submit"
          disabled={
            !enabled || busy || attempt?.outcome === "created" || !name.trim()
          }
        >
          {busy
            ? "正在提交…"
            : attempt?.outcome === "created"
              ? "本次请求已提交"
              : attempt
                ? "用原幂等键重试"
                : "提交合成演练"}
        </button>
        {(attempt?.outcome === "created" ||
          attempt?.outcome === "rejected") && (
          <button
            className="wide"
            type="button"
            disabled={busy}
            onClick={reset}
          >
            准备下一次演练
          </button>
        )}
        {!enabled && <small>连接正常且固定契约一致后可提交。</small>}
      </form>
    </section>
  );
}
