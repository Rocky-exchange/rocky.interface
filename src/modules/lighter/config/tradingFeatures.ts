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
// (tp_price/sl_price attached to POST /v1/orders, which the backend drops
// silently), and the mobile equivalents. These need POST /v1/trigger-orders,
// which rocky-backend still does not implement — keep off until it ships.
export const POSITION_TPSL_ENABLED = true;
export const TRIGGER_ORDERS_ENABLED = false;
