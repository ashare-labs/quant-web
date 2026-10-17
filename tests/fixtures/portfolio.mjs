// Artificial values for boundary tests; no market data, accounts or historical receipts.
export function evidence(mode = "covered_research") {
  const id = `m2job-${"a".repeat(32)}`;
  const selection = { dataset_id:"data", securities:["000001.XSHE","600036.XSHG"], start_date:"2020-02-03", end_date:"2020-02-03", mode, accept_retrospective_state:true };
  const request = { ...selection, strategy_version_id:"version", assumption_ack_sha256:"ack" };
  const scope = { securities:selection.securities, start_date:selection.start_date, end_date:selection.end_date, trading_dates:[selection.start_date] };
  const economic_scope = mode === "price_only_no_limits" ? "price_only_no_limits_not_total_return" : "source_covered_conditional_research";
  const preflight = { selection, scope, economic_scope, ready:true, input_sha256:"input", assumption_ack_sha256:"ack", assumptions:["bounded research"], limitations:["no PIT claim"] };
  const manifest = { schema_version:"portfolio-job-manifest.v1", job_id:id, request, preflight, execution_scope:scope, session_sha256:"session", session:{run_id:"run", native_identity:"native", details:{input_sha256:"input"}}, strategy:{version_id:"version"}, data_identity:{dataset_id:"data"}, service_identity:{source_sha256:"source"} };
  const job = { contract_version:"portfolio-jobs.v1", job_id:id, request, session_sha256:"session", account_id:"bt-run", status:"succeeded", result:{result_id:id}, committed_cursor:3,total_cursors:3 };
  const result = { contract_version:"portfolio-result.v1", job_id:id, account_id:job.account_id, request, strategy:manifest.strategy, service_identity:manifest.service_identity, scope, data_identity:manifest.data_identity, economic_scope, assumptions:preflight.assumptions,limitations:preflight.limitations, summary:{metric_scope:economic_scope,trade_count:0,order_count:0,final_cash:"1000",final_equity:"1000"}, account:{cash:"1000",equity:"1000",positions:{}}, days:[{date:selection.start_date,positions:{}}], trades:[],orders:[],receipt:{identity:"native",final_account:{cash:"1000",equity:"1000",positions:{}}},audit:{passed:true,accounting_passed:true}, recovery:{checkpoint_complete:true,final_cursor:3} };
  Object.assign(result.receipt, {accounts: structuredClone(result.days), trades:[], orders:[], decisions:[]});
  result.decisions=[];
  return {id,job,manifest,logs:{job_id:id,items:[]},result};
}
