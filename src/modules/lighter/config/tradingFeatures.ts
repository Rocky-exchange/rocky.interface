// TP/SL & trigger-order feature gates, split by what rocky-backend supports.
//
// POSITION_TPSL_ENABLED — position-level take-profit/stop-loss. Backed by
// POST/GET/DELETE /v1/positions/{user_uuid}:{symbol}/tp-sl + the risk-monitor
// trigger engine (shipped 2026-07-30, see rocky-backend
// docs/superpowers/specs/2026-07-30-position-tpsl-design.md). Gates the
// positions-table TP/SL column and the TP/SL edit modal.
//
// TRIGGER_ORDERS_ENABLED — standalone conditional orders: the desktop
// Advanced (S/L / T/P) order-type menu, the order-form TP/SL checkbox
// (tp_price/sl_price attached to POST /v1/orders → position_tpsl upsert),
// and the mobile equivalents. Backed by ledger.trigger_orders +
// POST/GET/DELETE /v1/trigger-orders + the risk-monitor engine since
// 2026-07-30 (second wave of the TP/SL design doc).
export const POSITION_TPSL_ENABLED = true;
export const TRIGGER_ORDERS_ENABLED = true;
