// rocky-backend has no TP/SL or conditional/trigger-order support yet:
//  - POST/GET/DELETE /v1/positions/:id/tp-sl do not exist (POST happens to
//    collide with GET /v1/positions/{user_id}/{symbol} in api-gateway
//    routes/account.rs, so the browser sees a 405 instead of a 404)
//  - POST /v1/trigger-orders does not exist
// Until the backend ships conditional orders, every TP/SL entry point in the
// futures UI is gated behind this flag so users cannot reach dead endpoints.
// Flip to true once the backend implements the routes above.
export const TPSL_ENABLED = false;
