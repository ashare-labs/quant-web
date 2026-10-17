import { money } from "../../shared/format.ts";
import type { PortfolioModel } from "./api";

// Do not drop zero-quantity positions: they can still own unsettled entitlements.
export function positionRows(
  days: readonly Pick<PortfolioModel<"PortfolioDay">, "date" | "positions">[],
  security = "all",
) {
  return days.flatMap((day) =>
    Object.entries(day.positions)
      .filter(([symbol]) => security === "all" || symbol === security)
      .map(([symbol, p]) => [
        day.date,
        symbol,
        p.quantity,
        p.sellable,
        p.restricted_shares ?? "—",
        p.pending_shares ?? "—",
        money(p.price),
        money(p.value),
        money(p.pending_share_value),
        money(p.average_price),
        money(p.dividend_receivable),
      ]),
  );
}
