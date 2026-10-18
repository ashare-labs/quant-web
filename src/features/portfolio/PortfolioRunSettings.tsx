import {
  ResearchAssumptions,
  ResearchLimitations,
  ScopeNote,
  algorithmName,
  icon,
  short,
} from "./PortfolioUi";
import { base, draftPublication } from "./draft";
import { validPortfolioCash as validCash, validVolumeRatio } from "./state.ts";
import type { PortfolioController } from "./usePortfolioController";
import { environmentKey } from "../../shared/product-config";
import { declaredMode } from "./dataset-mode";

type Props = Pick<
  PortfolioController,
  | "index"
  | "error"
  | "reading"
  | "at"
  | "refresh"
  | "dataset"
  | "selectionReady"
  | "currentPreflight"
  | "checking"
  | "preflightError"
  | "checkSelection"
  | "selectStrategy"
  | "prepareNew"
  | "mutate"
  | "draft"
  | "update"
  | "operation"
  | "busy"
  | "actionError"
  | "settings"
  | "setSettings"
  | "current"
  | "feeModel"
  | "matched"
  | "runReady"
  | "environmentError"
  | "modeError"
>;
export function PortfolioRunSettings({
  index,
  error,
  reading,
  at,
  refresh,
  dataset,
  selectionReady,
  currentPreflight,
  checking,
  preflightError,
  checkSelection,
  selectStrategy,
  prepareNew,
  mutate,
  draft,
  update,
  operation,
  busy,
  actionError,
  settings,
  setSettings,
  current,
  feeModel,
  matched,
  runReady,
  environmentError,
  modeError,
}: Props) {
  const publication = draftPublication(draft);
  return (
    <section className="qw-run-pane" aria-label="回测设置">
      <div className="qw-run-toolbar">
        <select
          aria-label="开始日期"
          value={draft.start}
          onChange={(e) => update({ start: e.target.value })}
        >
          <option value="">开始日期</option>
          {dataset?.trading_dates.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <span>至</span>
        <select
          aria-label="结束日期"
          value={draft.end}
          onChange={(e) => update({ end: e.target.value })}
        >
          <option value="">结束日期</option>
          {dataset?.trading_dates.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <label className="qw-cash">
          <span>￥</span>
          <input
            aria-label="初始资金"
            inputMode="decimal"
            value={draft.cash}
            onChange={(e) => update({ cash: e.target.value })}
          />
        </label>
        <select aria-label="频率" value="1d" disabled>
          <option value="1d">每天</option>
        </select>
        <button
          className="qw-primary qw-run-button"
          disabled={!runReady || busy}
          onClick={() => void mutate("create")}
        >
          {busy
            ? "提交中…"
            : draft.mode === "price_only_no_limits"
              ? "运行价格诊断"
              : "运行回测"}
        </button>
      </div>
      <div className="qw-config">
        <p>当前环境：{index?.configuration.profile || "未连接"} · <a href="#/data">从正式主库选择股票与窗口</a></p>
        {environmentError && <p className="qw-error-text" role="alert">{environmentError}</p>}
        {modeError && <div className="qw-error-text" role="alert"><p>{modeError}</p>
          {declaredMode(dataset) && <button onClick={() => update({ mode: declaredMode(dataset)!, retrospective: false })}>使用此数据声明的模式</button>}
        </div>}
        {publication && <section aria-label="正式发布来源" className="qw-assumptions">
          <strong>正式发布来源</strong>
          <p>实际来源：{JSON.stringify(publication.selected_sources ?? "未提供")}</p>
          <p>选源窗口：{JSON.stringify(publication.source_selection_scope ?? "未提供")}</p>
          <p>参考数据组：{JSON.stringify(publication.reference_set ?? "未提供")} · 模式：{draft.mode === "covered_research" ? "普通回测" : "价格诊断"}</p>
          <details><summary>发布清单与来源回执</summary><pre>{JSON.stringify(publication, null, 2)}</pre></details>
        </section>}
        <div className="qw-config-row">
          <label>
            数据窗口
            <select
              aria-label="数据窗口"
              value={draft.dataset}
              onChange={(e) => {
                const d = index?.catalogue.datasets.find(
                  (d) => d.dataset_id === e.target.value,
                );
                update({
                  dataset: e.target.value,
                  environment: index ? environmentKey(index.configuration) : "",
                  mode: declaredMode(d) || "covered_research",
                  retrospective: false,
                  securities: [],
                  start: d?.trading_dates[0] || "",
                  end: d?.trading_dates.at(-1) || "",
                });
              }}
            >
              <option value="">选择已导入数据</option>
              {draft.dataset && !dataset && <option value={draft.dataset} disabled>草稿数据集不在当前环境 · {short(draft.dataset)}</option>}
              {index?.catalogue.datasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id}>
                  {d.name} · {d.trading_dates[0]}—{d.trading_dates.at(-1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="qw-securities">
          <legend>证券集合 · 已选 {draft.securities.length} 只</legend>
          {dataset?.securities.map((s) => (
            <label className="qw-check" key={s}>
              <input
                type="checkbox"
                aria-label={s}
                checked={draft.securities.includes(s)}
                onChange={(e) =>
                  update({
                    securities: e.target.checked
                      ? [...draft.securities, s].sort()
                      : draft.securities.filter((v) => v !== s),
                  })
                }
              />
              {s}
            </label>
          ))}
        </fieldset>
        <div className="qw-config-row">
          <label className="qw-version-select">
            执行版本
            <select
              aria-label="执行版本"
              value={draft.version}
              onChange={(e) => {
                const s = index?.strategies.find(
                  (s) => s.version_id === e.target.value,
                );
                if (s) selectStrategy(s, draft.name);
              }}
            >
              <option value="">先注册或选择版本</option>
              {index?.strategies.map((s) => (
                <option key={s.version_id} value={s.version_id}>
                  {algorithmName(s.definition.algorithm)} ·{" "}
                  {short(s.version_id)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="qw-text-button"
            onClick={() => setSettings((v) => !v)}
          >
            {settings ? "收起" : "费用与参数"}{" "}
            {icon(settings ? "angle-up" : "angle-down")}
          </button>
        </div>
        {settings && (
          <div className="qw-extra">
            <div className="qw-fees">
              {[
                ["买入佣金率", "buy_commission_rate"],
                ["卖出佣金率", "sell_commission_rate"],
                ["最低佣金", "minimum_commission"],
                ["卖出税率", "sell_tax_rate"],
                ["过户费", "transfer_fee"],
                ["滑点", "slippage"],
              ].map(([name, key]) => (
                <label key={key}>
                  {name}
                  <input readOnly value={String(feeModel?.[key] ?? "—")} />
                </label>
              ))}
            </div>
            <p>
              固定跨期研究模型，不代表历史法定费率。费用由原生引擎计算，当前模型只读。
            </p>
            <label>
              成交量参与率（可选，0 &lt; 比例 ≤ 1）
              <input
                aria-label="成交量参与率"
                placeholder="留空使用默认；例如 0.10"
                value={draft.volume}
                onChange={(e) => update({ volume: e.target.value })}
              />
            </label>
          </div>
        )}
        <div className="qw-config-row">
          <label>
            数据声明模式
            <select
              aria-label="研究模式"
              value={draft.mode}
              disabled
            >
              <option value="covered_research">普通回测（有来源覆盖）</option>
              <option value="price_only_no_limits">
                价格诊断（无限价、无公司行动）
              </option>
            </select>
          </label>
        </div>
        <p>模式随已发布数据固定。独立价格诊断需从正式数据页另行选择并确认；不能剥离公司行动来源转换。</p>
        <ScopeNote mode={draft.mode} scope={currentPreflight?.economic_scope} />
        <label className="qw-check qw-retrospective">
          <input
            type="checkbox"
            checked={draft.retrospective}
            onChange={(e) => update({ retrospective: e.target.checked })}
          />
          接受已声明的回溯状态研究模型（不代表历史 PIT）
        </label>
        <div className="qw-preflight-row">
          <button
            disabled={!current || !selectionReady || busy || checking}
            onClick={() => void checkSelection()}
          >
            {checking ? "正在检查…" : "检查数据与假设"}
          </button>
          <span>
            {currentPreflight
              ? currentPreflight.ready
                ? `检查通过 · ${currentPreflight.scope?.trading_dates.length} 日 · ${draft.securities.length} 只证券`
                : `检查未通过 · ${currentPreflight.gaps.length} 项缺口`
              : "证券、日期或模式变化后须重新检查"}
          </span>
        </div>
        {preflightError && <p className="qw-error-text">{preflightError}</p>}
        {currentPreflight && (
          <>
            {!!currentPreflight.gaps.length && (
              <details className="qw-preflight-gaps" open>
                <summary>数据缺口 · {currentPreflight.gaps.length} 项</summary>
                <pre>{JSON.stringify(currentPreflight.gaps, null, 2)}</pre>
              </details>
            )}
            <details className="qw-assumptions">
              <summary>
                本次研究假设与限制 · {currentPreflight.assumptions.length}{" "}
                项假设
              </summary>
              <ResearchAssumptions values={currentPreflight.assumptions} />
              <ResearchLimitations
                values={currentPreflight.limitations}
                mode={draft.mode}
              />
            </details>
            {currentPreflight.ready && (
              <label className="qw-check">
                <input
                  type="checkbox"
                  checked={draft.ack === currentPreflight.assumption_ack_sha256}
                  onChange={(e) =>
                    update({
                      ack: e.target.checked
                        ? currentPreflight.assumption_ack_sha256
                        : "",
                    })
                  }
                />
                已阅读并接受本次证券、日期与模式的研究假设
              </label>
            )}
          </>
        )}
        {dataset && (
          <details className="qw-assumptions">
            <summary>数据来源与目录范围</summary>
            <p>
              只使用导入目录中的实际证券与交易日，预检查还会核验 120
              日预热及所需下一开市日；不会补行情或替换证券。
            </p>
            <pre>
              {JSON.stringify(
                {
                  dataset_id: dataset.dataset_id,
                  input_sha256: dataset.input_sha256,
                  state_mode: dataset.state_mode,
                  mode: declaredMode(dataset),
                  action_coverage: dataset.action_coverage,
                  source_refs: dataset.source_refs,
                  limitations: dataset.limitations,
                },
                null,
                2,
              )}
            </pre>
          </details>
        )}
        {!validCash(draft.cash) && (
          <p className="qw-error-text">
            资金须大于 0，使用十进制文本，最多 8 位小数、40 个字符。
          </p>
        )}
        {!validVolumeRatio(draft.volume) && (
          <p className="qw-error-text">
            参与率应留空，或使用大于 0 且不超过 1 的十进制文本。
          </p>
        )}
        {current && !current.catalogue.native_ready && (
          <p className="qw-error-text">
            原生执行环境不可用：{current.catalogue.native_error}
          </p>
        )}
        {current && !current.catalogue.datasets.length && (
          <p className="qw-error-text">
            尚无发布数据，请从 <a href="#/data">正式数据与回测</a> 选择主库股票并发布窗口。
          </p>
        )}
        {operation?.state === "done" && (
          <p className="qw-submitted">
            本次请求已提交。
            <a href={`${base}/results/${operation.jobId}`}>查看结果</a>
            <button onClick={prepareNew}>准备新回测</button>
          </p>
        )}
        {operation?.state === "rejected" && (
          <p className="qw-error-text">
            上次请求已拒绝：{operation.error}
            <button onClick={prepareNew}>修改后重新提交</button>
          </p>
        )}
      </div>
      <div className="qw-log-tabs">
        <strong>日志</strong>
        <span>错误</span>
        <button onClick={refresh} disabled={busy || reading}>
          {icon("refresh")} 刷新状态
        </button>
      </div>
      <div className="qw-console">
        <p>
          {current
            ? `服务已连接 · ${current.catalogue.service_identity.backend_version}`
            : "等待任务服务连接…"}
        </p>
        <p>
          {matched
            ? `执行版本 ${draft.version}`
            : "编辑完成后注册定义，任务将冻结算法、数据与参数。"}
        </p>
        <p>
          {operation?.error ||
            actionError ||
            "启动后可在回测详情查看原生权益、逐证券成交/持仓、决策和完整日志。"}
        </p>
      </div>
    </section>
  );
}
