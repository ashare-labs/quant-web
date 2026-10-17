import "font-awesome/css/font-awesome.css";
import { time } from "../../shared/format.ts";
import { base } from "./draft";
import "./portfolio.css";
import { PortfolioDefinition } from "./PortfolioDefinition";
import { PortfolioHeader } from "./PortfolioHeader";
import { PortfolioLists } from "./PortfolioLists";
import { PortfolioRun } from "./PortfolioRun";
import { PortfolioRunSettings } from "./PortfolioRunSettings";
import { Empty, short } from "./PortfolioUi";
import { usePortfolioController } from "./usePortfolioController";

export function PortfolioPage({ route }: { route: string }) {
  const model = usePortfolioController(route);
  const { page, current, at } = model;
  return (
    <div className="qw-app">
      <PortfolioHeader {...model} />
      {page === "editor" && (
        <div className="qw-workspace">
          <PortfolioDefinition {...model} />
          <PortfolioRunSettings {...model} />
        </div>
      )}
      {(page === "strategies" || page === "tasks") && (
        <PortfolioLists {...model} />
      )}
      {page === "results" && <PortfolioRun {...model} />}
      {!["editor", "strategies", "tasks", "results"].includes(page) && (
        <Empty>
          页面不存在。<a href={`${base}/strategies`}>返回策略列表</a>
        </Empty>
      )}
      <footer className="qw-footer">
        <span>quant-web · 本地研究</span>
        <span>
          AQ {current?.catalogue.service_identity.backend_version || "未连接"} ·
          源码{" "}
          {current
            ? short(current.catalogue.service_identity.source_sha256)
            : "—"}{" "}
          · {at ? `更新于 ${time(at)}` : "等待连接"}
        </span>
      </footer>
    </div>
  );
}
