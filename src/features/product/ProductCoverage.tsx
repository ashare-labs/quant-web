import { isRecord } from "../../shared/json";
import { ResearchAssumptions } from "../portfolio/PortfolioUi";
import type { Coverage } from "./api";

const valueText = (value: unknown) => value == null ? "未提供" : typeof value === "string" ? value : JSON.stringify(value);

export function ProductCoverage({ coverage }: { coverage: Coverage }) {
  return <section className="panel product-coverage" aria-label="普通回测覆盖结果">
    <h2>{coverage.ready ? "覆盖检查通过" : `覆盖检查未通过 · ${coverage.gaps.length} 项缺口`}</h2>
    <p>{coverage.scope.securities.join("、")} · {coverage.scope.start} 至 {coverage.scope.end}</p>
    <p>参考数据组：{coverage.reference_set?.name || "未配置"}。{coverage.ready
      ? "此窗口可发布普通回测；组合参数的精确预检和假设确认仍须通过。"
      : "补齐对应证券、日期及来源后重新检查。当前选择保持不变，不会自动改为价格诊断。"}</p>
    {!!coverage.gaps.length && <div className="table-scroll"><table><caption>具体缺口</caption><thead><tr><th>证券</th><th>日期</th><th>字段 / 代码</th><th>说明</th></tr></thead><tbody>
      {coverage.gaps.map((gap, i) => <tr key={i}>
        <td>{isRecord(gap) ? valueText(gap.security) : "未提供"}</td>
        <td>{isRecord(gap) ? valueText(gap.date) : "未提供"}</td>
        <td>{isRecord(gap) ? `${valueText(gap.field)} / ${valueText(gap.code)}` : "未提供"}</td>
        <td>{isRecord(gap) ? valueText(gap.detail ?? gap.message ?? gap) : valueText(gap)}</td>
      </tr>)}
    </tbody></table></div>}
    <div className="notice"><strong>本次模型假设</strong><ResearchAssumptions values={coverage.assumptions}/>
      {!coverage.assumptions.length && <p>来源未提供模型假设。</p>}</div>
    <details><summary>参考来源绑定、限制与完整覆盖回执</summary>
      {coverage.limitations.map((value, i) => <p key={i}>{value}</p>)}
      <pre>{JSON.stringify(coverage, null, 2)}</pre>
    </details>
  </section>;
}
