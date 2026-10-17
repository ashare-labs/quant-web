import contract from "../../../contracts/api.openapi.json";
import { canonical, time } from "../../shared/format.ts";
import { useOnline } from "../../shared/useOnline";
import { usePoll } from "../../shared/usePoll";
import { api, PIN, type Model } from "./api";

import { Badge, Empty, ErrorBox, Json, Pairs } from "./ExecutionUi";
import { isActive, type Bootstrap, type Run, type Strategy } from "./model";
import { RunDetail } from "./RunDetail";
import { RunForm } from "./RunForm";
const loadBootstrap = async (): Promise<Bootstrap> => {
  const [capabilities, scenarios, nativeScenarios, live] = await Promise.all([
    api<Model<"Capabilities">>("/capabilities"),
    api<Record<string, unknown>>("/scenarios"),
    api<Record<string, unknown>>("/rqalpha/scenarios"),
    api<unknown>("/openapi.json"),
  ]);
  return {
    capabilities,
    scenarios,
    nativeScenarios,
    compatible: canonical(live) === canonical(contract),
  };
};
const loadIndex = async () => {
  const [runs, strategies] = await Promise.all([
    api<Run[]>("/runs"),
    api<Strategy[]>("/strategies"),
  ]);
  return { runs, strategies };
};
export function ExecutionPage({ route }: { route: string }) {
  const online = useOnline();
  const boot = usePoll(loadBootstrap, 30000);
  const index = usePoll(loadIndex, 3000);
  let id: string | undefined;
  try {
    if (route.startsWith("#/execution/runs/"))
      id = decodeURIComponent(route.slice("#/execution/runs/".length));
  } catch {
    /* An invalid encoded route remains unselected. */
  }
  const enabled =
    online && !boot.error && !index.error && boot.data?.compatible === true;
  return (
    <main>
      <header>
        <h1>执行与合成演练</h1>
        <p>使用固定人工场景检查原生执行；真实任务结果由后端提供。</p>
      </header>
      {!online && <ErrorBox text="浏览器离线，操作已禁用。" />}
      <ErrorBox text={boot.error || index.error} />
      {boot.data && !boot.data.compatible && (
        <ErrorBox text="EXECUTION_CONTRACT_MISMATCH · 当前服务契约不匹配，操作已禁用。" />
      )}
      {route.startsWith("#/execution/capabilities") ? (
        <Capabilities data={boot.data} />
      ) : (
        <div className="workspace">
          <aside>
            <RunForm
              boot={boot.data}
              enabled={enabled}
              onCreated={index.refresh}
            />
            <section className="panel help">
              <h2>操作顺序</h2>
              <ol>
                <li>选择人工样例，核对固定参数。</li>
                <li>提交后由独立 worker 消费排队任务。</li>
                <li>检查订单、成交、账户、日志与 manifest。</li>
              </ol>
              <p>
                暂停 / 恢复：当前无 HTTP
                API。原生取消需等待停止写者并最终对账；worker 恢复需本机 CLI
                操作，准入边界见上方说明。
              </p>
            </section>
          </aside>
          <div className="content">
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>运行记录</h2>
                  <p>
                    {index.data?.runs.length ?? "—"} 条 · 每 3 秒读取 · 最后读取{" "}
                    {time(index.at)}
                  </p>
                </div>
                <button onClick={index.refresh} disabled={index.loading}>
                  刷新列表
                </button>
              </div>
              {index.loading && <Empty>正在读取运行列表…</Empty>}
              {index.data?.runs.length === 0 && (
                <Empty>还没有运行。先从左侧提交一次合成演练。</Empty>
              )}
              {!!index.data?.runs.length && (
                <div className="run-list">
                  {[...index.data.runs]
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((r) => (
                      <a
                        className={`run-row ${id === r.run_id ? "current" : ""}`}
                        href={`#/execution/runs/${encodeURIComponent(r.run_id)}`}
                        key={r.run_id}
                      >
                        <div>
                          <strong>
                            {index.data?.strategies.find(
                              (s) => s.version_id === r.strategy_version_id,
                            )?.definition.name || "固定策略规格"}
                          </strong>
                          <code>{r.run_id}</code>
                        </div>
                        <div>
                          <Badge status={r.status} />
                          {r.cancel_requested_at && isActive(r) && (
                            <span className="badge queued">取消待对账</span>
                          )}
                          {r.reconciliation_required && (
                            <span className="badge queued">需对账</span>
                          )}
                          <small>
                            {r.account_id} · {time(r.created_at)}
                          </small>
                        </div>
                      </a>
                    ))}
                </div>
              )}
            </section>
            {id ? (
              <RunDetail
                key={id}
                id={id}
                enabled={enabled}
                onChange={index.refresh}
              />
            ) : (
              <section className="panel">
                <Empty>选择一条运行，查看后端执行投影与证据。</Empty>
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
function Capabilities({ data }: { data?: Bootstrap }) {
  return (
    <section className="panel">
      <h2>能力边界与固定契约</h2>
      <p>
        后端身份由功能契约约束；运行时检查 OpenAPI 结构，不把 schema
        一致当作源码身份验证。
      </p>
      <Pairs
        value={{
          backend_source: PIN,
          api: "/api/v1",
          contract: "contracts/api.openapi.json",
          interface_match: data ? String(data.compatible) : "等待连接",
          parameter_editing: "日频任务支持固定窗口、参数和数据绑定",
          pause_resume: "合成无 HTTP 暂停/恢复；回测任务恢复见对应入口",
          metrics: "只有后端账户 equity；无收益率 / 回撤接口",
        }}
      />
      <h3>后端实时能力响应</h3>
      {data ? (
        <Json value={data.capabilities} />
      ) : (
        <Empty>尚未取得后端能力响应。</Empty>
      )}
      <p>
        restart 是恢复场景样例；选择它不会自动注入进程崩溃。原生恢复由固定环境的
        CLI worker 接管，浏览器只读执行状态。
      </p>
    </section>
  );
}
