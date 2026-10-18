import "./market.css";

import { MarketResults } from "./MarketResults";
import { ReadError } from "./MarketUi";
import { fields, type Query } from "./model";
import { useMarketQuery } from "./useMarketQuery";
export function MarketBrowser({ enabled }: { enabled: boolean }) {
  const model = useMarketQuery(enabled);
  const {
    aliases,
    aliasError,
    setAliasesRevision,
    alias,
    setAlias,
    dataset,
    setDataset,
    selected,
    setSelected,
    securities,
    securityInput,
    setSecurityInput,
    applySecurities,
    start,
    setStart,
    end,
    setEnd,
    mode,
    setMode,
    count,
    setCount,
    wanted,
    setWanted,
    visibility,
    setVisibility,
    asOf,
    setAsOf,
    adjustment,
    setAdjustment,
    requirements,
    setRequirements,
    description,
    coverage,
    error,
    busy,
    load,
    priceValid,
    blocked,
  } = model;
  return (
    <div className="research-workspace">
      <section className="panel research-query">
        <div className="section-head">
          <div>
            <span className="kicker">01 / 只读查询</span>
            <h2>已发布研究与固定评测快照</h2>
          </div>
          <span className="tag">READ ONLY</span>
        </div>
        <p className="notice">
          公开 API
          读取已保存数据。可从描述符选择证券，或输入完整标识；此页不采集、不写入、不补数，也不提交策略运行。
        </p>
        <ReadError error={aliasError} />
        {!aliases && !aliasError && (
          <p role="status">正在读取可用 store 别名…</p>
        )}
        {aliases?.length === 0 && (
          <div className="empty">
            后端未配置研究 store。请按本机启动指引配置已有 store
            别名；不需要在浏览器填写文件路径。
          </div>
        )}
        <button
          onClick={() => setAliasesRevision((x) => x + 1)}
          disabled={busy}
        >
          刷新可用别名
        </button>
        <fieldset disabled={busy}>
          <label>
            公开 store 别名
            <select value={alias} onChange={(e) => setAlias(e.target.value)}>
              <option value="">请选择已配置别名</option>
              {aliases?.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            固定 dataset ID
            <input
              value={dataset}
              maxLength={64}
              pattern="[a-f0-9]{64}"
              onChange={(e) => {
                setDataset(e.target.value);
              }}
            />
            <small>
              完整64位ID，不接受 latest 或文件路径。来源身份以 API 响应为准。
            </small>
          </label>
        </fieldset>
        <button
          className="wide"
          onClick={() => void load("description")}
          disabled={blocked}
        >
          读取快照身份
        </button>
        <fieldset disabled={busy}>
          <div className="checks" role="group" aria-label="证券">
            <h3>证券</h3>
            {!securities.length && <p>先读取快照身份以获取实际证券，或在下方输入完整证券标识。</p>}
            {securities.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={selected.includes(s)}
                  onChange={(e) =>
                    setSelected((previous) =>
                      e.target.checked
                        ? [...previous, s]
                        : previous.filter((x) => x !== s),
                    )
                  }
                />
                {s}
              </label>
            ))}
          </div>
          <label>证券标识（空格或逗号分隔）<input aria-label="研究证券标识" value={securityInput} placeholder="例如 600519.XSHG 000002.XSHE" onChange={e => setSecurityInput(e.target.value)}/></label>
          <button onClick={applySecurities} disabled={!securityInput.trim()}>使用输入证券</button>
          <label>
            价格查询范围
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "range" | "count")}
            >
              <option value="range">开始 / 结束日期</option>
              <option value="count">最近 count 行</option>
            </select>
          </label>
          <div className="query-dates">
            <label>
              开始日期
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          {mode === "count" && (
            <>
              <label>
                count
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
              <small>
                价格请求只发送 count；上方日期仅用于独立的 coverage 查询。
              </small>
            </>
          )}
          <div className="checks" role="group" aria-label="请求字段">
            <h3>请求字段</h3>
            {fields.map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={wanted.includes(f)}
                  onChange={(e) =>
                    setWanted((previous) =>
                      e.target.checked
                        ? [...previous, f]
                        : previous.filter((x) => x !== f),
                    )
                  }
                />
                {f}
              </label>
            ))}
          </div>
          <label>
            可见性 visibility
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as NonNullable<Query["visibility"]>,
                )
              }
            >
              <option value="snapshot">snapshot · 无历史时钟</option>
              <option value="assumed">assumed · 假定可见</option>
              <option value="received">received · 接收记录</option>
              <option value="verified">
                verified · 严格PIT要求（当前拒绝）
              </option>
            </select>
          </label>
          {visibility !== "snapshot" && (
            <label>
              as_of（必须含时区）
              <input
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                placeholder="2020-01-08T00:00:00+08:00"
              />
              <small>原样交给后端；不把 assumed 转成 verified。</small>
            </label>
          )}
          <details>
            <summary>质量 / 复权要求 · 缺失保证时后端将拒绝</summary>
            <label>
              复权 adjustment
              <select
                value={adjustment}
                onChange={(e) =>
                  setAdjustment(
                    e.target.value as NonNullable<Query["adjustment"]>,
                  )
                }
              >
                <option value="none">none</option>
                <option value="pre">pre（当前拒绝）</option>
                <option value="post">post（当前拒绝）</option>
              </select>
            </label>
            <div className="checks">
              {(Object.keys(requirements) as (keyof typeof requirements)[]).map(
                (key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={requirements[key]}
                      onChange={(e) =>
                        setRequirements((previous) => ({
                          ...previous,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {key}
                  </label>
                ),
              )}
            </div>
          </details>
        </fieldset>
        <div className="toolbar">
          <button
            className="primary"
            onClick={() => void load("prices")}
            disabled={blocked || !priceValid}
          >
            {busy ? "正在读取…" : "读取日线"}
          </button>
          <button
            onClick={() => void load("coverage")}
            disabled={blocked || !selected.length || !start || !end}
          >
            读取覆盖报告
          </button>
        </div>
        {!enabled && <small>本机 API 已连接且固定契约匹配后可读取。</small>}
      </section>
      <MarketResults {...model} />
    </div>
  );
}
