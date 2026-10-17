// Artificial display projections, never execution evidence or a product import.
export function dailyResult(kind = 'no-signal') {
  const day = {
    trading_date: '2020-01-06', previous_open: '2020-01-03', decision_at: '2020-01-06T09:00:00+08:00',
    signal: { action: 'no_change', reason: 'inside_band', target_shares: null, rule_index: null },
    ad08: { previous_close: '12.34001230' }, execution_close: null, execution_price_read_status: 'not_read_no_order',
    no_order_reason: 'signal_no_change', native_reason: null, orders: [], fills: [], native_rejections: [],
    day_fee: '0.00000000', cumulative_fee: '0.00000000',
  };
  const summary = { initial_cash: '10000', final_cash: '10000.00000000', final_equity: '10000.00000000',
    net_change: '0.00000000', final_quantity: 0, fee_total: '0.00000000', commission_total: '0.00000000', tax_total: '0.00000000',
    committed_order_count: 0, committed_fill_count: 0, actual_history_call_count: 1, native_cache_consumption_count: 1 };
  if (kind === 'rejected') {
    Object.assign(summary, { initial_cash: '0.01', final_cash: '0.01000000', final_equity: '0.01000000' });
    day.signal = { action: 'target_shares', reason: 'enter_threshold', target_shares: 100, rule_index: 0 };
    day.no_order_reason = 'native_rejected'; day.native_reason = 'SYNTHETIC_INSUFFICIENT_CASH: requested 100 shares';
    day.native_rejections = [{ observed_at: '2020-01-06T15:00:00+08:00', event: 'ORDER_CREATION_REJECT', phase: 'SUBMIT_MATCH',
      generation: 1, cursor: 2, native_observation_index: 7, order_id: null, reason: 'SYNTHETIC_INSUFFICIENT_CASH: requested 100 shares' }];
  }
  if (kind === 'partial') {
    day.signal = { action: 'target_shares', reason: 'rule_matched', target_shares: 200, rule_index: 0 };
    day.no_order_reason = null; day.native_reason = 'SYNTHETIC_PARTIAL_FILL';
    day.execution_close = '12.34001230'; day.execution_price_read_status = 'owner_execution_bar_observed';
    day.orders = [{ order_id: 'order-1', security: '600000.XSHG', side: 'buy', requested_quantity: 200,
      filled_quantity: 100, remaining_quantity: 100, status: 'partially_filled', reason: 'SYNTHETIC_REMAINING_ORDER', trade_ids: ['fill-1'] }];
    day.fills = [{ fill_id: 'fill-1', order_id: 'order-1', side: 'buy', quantity: 100, price: '12.34001230',
      commission: '5.00000000', tax: '0.00000000', fee: '5.00000000', filled_at: '2020-01-06T15:00:00+08:00' }];
    day.day_fee = '5.00000000'; day.cumulative_fee = '5.00000000';
    Object.assign(summary, { final_cash: '8760.99877000', final_equity: '9995.00000000', final_quantity: 100,
      net_change: '-5.00000000', fee_total: '5.00000000', commission_total: '5.00000000', committed_order_count: 1, committed_fill_count: 1 });
  }
  return { days: [day], summary, scope: { grade: 'conditional_research' }, historical_pit_verified: false,
    paper_admitted: false, general_execution_permission: false, valuation_bar_query_observed: false,
    engine_price_reads: [{ trading_date: day.trading_date, operation: 'valuation_bar', native_observation_index: 8,
      verification: 'committed_historical_integrity_only', authorizes_new_read: false }],
    recovery: {}, evidence: {}, execution_identity: {}, data_identity: {}, assumptions: [], account: {} };
}
