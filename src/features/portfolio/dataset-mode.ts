import type { PortfolioModel } from "./api";

export type ResearchMode = "covered_research" | "price_only_no_limits";
export type DeclaredDataset = PortfolioModel<"PortfolioDataset"> & {
  mode?: ResearchMode;
  diagnostic_allowed?: boolean;
};

export function declaredMode(dataset: DeclaredDataset | undefined): ResearchMode | null {
  return dataset?.mode === "covered_research" || dataset?.mode === "price_only_no_limits" ? dataset.mode : null;
}

export function datasetModeError(dataset: DeclaredDataset | undefined, mode: ResearchMode): string {
  if (!dataset) return "";
  const declared = declaredMode(dataset);
  if (!declared) return "此数据集未声明研究模式，请重新读取配对服务或重新发布。";
  if (mode === "price_only_no_limits" && dataset.diagnostic_allowed !== true)
    return "此数据集不允许价格诊断；公司行动日程及来源不能剥离。请使用已声明的普通回测模式。";
  if (mode !== declared) return "草稿模式与数据集声明不一致。请采用此数据声明的模式后重新检查。";
  return "";
}
