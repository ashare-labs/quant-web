import test from "node:test";
import assert from "node:assert/strict";
import { positionRows } from "../../src/features/portfolio/positions.mjs";

test("zero settled shares retain cash receivable and pending shares at exact source precision", () => {
  const days = [{ date: "2020-02-05", positions: { "000001.XSHE": {
    quantity: 0, sellable: 0, restricted_shares: 0, pending_shares: 400,
    price: "8.000000001", value: "0", pending_share_value: "3200.000000400",
    average_price: "7.1", dividend_receivable: "260.00000001",
  } } }];
  const before = structuredClone(days);
  assert.deepEqual(positionRows(days), [["2020-02-05", "000001.XSHE", 0, 0, 0, 400,
    "8.000000001", "0", "3200.000000400", "7.1", "260.00000001"]]);
  assert.deepEqual(days, before);
  assert.deepEqual(positionRows(days, "600036.XSHG"), []);
});
test("legacy missing stage values stay unavailable while explicit formal zeros stay zero", () => {
  const p = { quantity: 1000, sellable: 1000, price: "8", value: "8000", average_price: "7", dividend_receivable: "0" };
  const old = positionRows([{ date: "2020-02-05", positions: { stock: p } }])[0];
  assert.deepEqual([old[4], old[5], old[8]], ["—", "—", "—"]);
  const current = positionRows([{ date: "2022-06-06", positions: { stock: { ...p,
    quantity: 1400, sellable: 1000, restricted_shares: 400, pending_shares: 0, pending_share_value: "0",
  } } }])[0];
  assert.deepEqual(current.slice(2, 6), [1400, 1000, 400, 0]);
  assert.equal(current[8], "0");
});
