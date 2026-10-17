import { StrategyEditor } from "../strategies/StrategyEditor";
import { algorithmName, download, icon, short } from "./PortfolioUi";
import { definitionAlgorithm } from "./draft";
import type { PortfolioController } from "./usePortfolioController";

type Props = Pick<
  PortfolioController,
  | "index"
  | "registerRules"
  | "draft"
  | "update"
  | "saveDraft"
  | "storageError"
  | "busy"
  | "current"
  | "matched"
>;
export function PortfolioDefinition({
  index,
  registerRules,
  draft,
  update,
  saveDraft,
  storageError,
  busy,
  current,
  matched,
}: Props) {
  return (
    <section className="qw-code-pane" aria-label="策略编辑">
      <div className="qw-editor-toolbar">
        <button onClick={saveDraft}>{icon("save")} 保存草稿</button>
        <button
          className="qw-primary"
          disabled={!current || busy || !!storageError}
          onClick={registerRules}
        >
          注册版本
        </button>
        <span className="qw-saved">草稿已自动保存</span>
        <select
          aria-label="组合算法"
          value={definitionAlgorithm(draft.code)}
          onChange={(e) =>
            update({
              code: JSON.stringify(
                { template: "daily_portfolio.v1", algorithm: e.target.value },
                null,
                2,
              ),
            })
          }
        >
          <option value="">选择算法</option>
          {index?.catalogue.strategy_algorithms.map((a) => (
            <option key={a} value={a}>
              {algorithmName(a)}
            </option>
          ))}
        </select>
        <button
          aria-label="下载定义"
          onClick={() => download("strategy-definition.json", draft.code)}
        >
          {icon("download")}
        </button>
      </div>
      <p className="qw-definition-note">
        策略定义 JSON · 执行服务内的固定组合算法。本版不执行任意
        Python；编辑后的定义须重新注册并绑定版本。
      </p>
      <StrategyEditor
        value={draft.code}
        language="json"
        onChange={(code) => update({ code })}
        onSave={saveDraft}
      />
      <div className="qw-editor-status">
        <span>JSON · daily_portfolio.v1</span>
        <span>{draft.code.split("\n").length} 行 · UTF-8</span>
        <span>
          {matched ? `已注册 ${short(draft.version)}` : "草稿未匹配执行版本"}
        </span>
      </div>
    </section>
  );
}
