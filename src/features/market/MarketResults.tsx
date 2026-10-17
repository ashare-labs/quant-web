import { money, time } from "../../shared/format.ts";

import { Raw, ReadError, Values } from "./MarketUi";
import { record } from "./model";
import type { MarketQuery } from "./useMarketQuery";
type Props = Pick<
  MarketQuery,
  | "selected"
  | "description"
  | "read"
  | "coverage"
  | "error"
  | "busy"
  | "tab"
  | "setTab"
  | "source"
>;
export function MarketResults({
  selected,
  description,
  read,
  coverage,
  error,
  busy,
  tab,
  setTab,
  source,
}: Props) {
  return (
    <section className="panel research-result">
      <div className="section-head">
        <div>
          <span className="kicker">02 / API 原始结果</span>
          <h2>行情快照与查询范围</h2>
        </div>
        <span className="tag">execution=false</span>
      </div>
      <div className="notice">
        <strong>只读查询</strong>
        <br />
        来源、覆盖范围与限制以本次后端响应为准。查询成功不代表行情真值、PIT、最终性或可交易性已验证。
      </div>
      <ReadError error={error} />
      {busy && (
        <p className="empty" role="status">
          正在通过后端公开 API 读取；不访问浏览器文件系统或私有数据。
        </p>
      )}
      {!description && !busy && !error && (
        <div className="empty">
          选择已保存快照，读取身份、日线或覆盖报告。这里不会显示预填行情。
        </div>
      )}
      {description && (
        <>
          <Values
            value={{
              dataset_id: description.dataset_id,
              source: source ?? "后端未提供",
              scope: description.scope,
              admission: description.data_owner?.admission ?? "未提供",
              backend_execution_permission:
                description.backend_execution_permission,
              source_range:
                record(description.descriptor).scope ?? "后端未提供",
            }}
          />
          <div className="tabs" role="tablist" aria-label="数据响应">
            {[
              ["rows", "日线行"],
              ["quality", "质量与来源"],
              ["coverage", "覆盖报告"],
              ["identity", "身份 / 描述符"],
            ].map(([value, label]) => (
              <button
                role="tab"
                aria-selected={tab === value}
                key={value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "rows" &&
              (read ? (
                <>
                  <p className="notice">
                    {read.rows.length} 行 · 读取完成{" "}
                    {time(read.read_completed_at)}。源标签时区{" "}
                    {read.source_timezone}；source_label_at 不是经认证的 bar_end
                    或历史发布时间。金额原样显示；null 为“未请求 /
                    未提供”，不补零。
                  </p>
                  <Raw title="本次实际查询" value={read.query} />
                  {read.rows.length ? (
                    <div className="table-scroll">
                      <table aria-label="来源日线">
                        <thead>
                          <tr>
                            {[
                              "证券",
                              "源日期",
                              "源标签 +08:00",
                              "open CNY",
                              "high CNY",
                              "low CNY",
                              "close CNY",
                              "volume 股",
                              "money CNY",
                            ].map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {read.rows.map((row, i) => (
                            <tr key={`${row.security}-${row.source_date}-${i}`}>
                              <td>{row.security}</td>
                              <td>{row.source_date}</td>
                              <td>{row.source_label_at}</td>
                              {(["open", "high", "low", "close"] as const).map(
                                (f) => (
                                  <td key={f}>
                                    {row[f] == null ? "—" : money(row[f])}
                                  </td>
                                ),
                              )}
                              <td>{row.volume ?? "—"}</td>
                              <td>
                                {row.money == null ? "—" : money(row.money)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty">
                      本次公开查询返回 0 行；不据此推导质量或完整性。
                    </div>
                  )}
                  <Raw title="完整读取响应（含 report）" value={read} />
                </>
              ) : (
                <div className="empty">
                  本次操作尚未返回日线行。点击“读取日线”取得真实 API 结果。
                </div>
              ))}
            {tab === "quality" && (
              <>
                <p className="notice">
                  保留来源的事实、未知项与拒绝。前端不生成质量评分或认证结论。
                </p>
                <Raw title="quality" value={description.quality} open />
                <Raw title="lineage" value={description.lineage} />
                {read && <Raw title="report" value={read.report} />}
              </>
            )}
            {tab === "coverage" &&
              (coverage ? (
                <>
                  <Raw title="实际覆盖查询" value={coverage.query} open />
                  <Raw title="按证券 coverage" value={coverage.coverage} open />
                </>
              ) : (
                <div className="empty">
                  尚无本次 coverage 结果。覆盖查询独立发送证券和开始/结束日期。
                </div>
              ))}
            {tab === "identity" && (
              <>
                <Raw title="data_owner" value={description.data_owner} open />
                <Raw title="descriptor" value={description.descriptor} open />
                <Raw title="完整身份响应" value={description} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
