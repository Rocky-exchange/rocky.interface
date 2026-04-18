export var TradeActionType;
(function (TradeActionType) {
    TradeActionType["OrderCreated"] = "OrderCreated";
    TradeActionType["OrderExecuted"] = "OrderExecuted";
    TradeActionType["OrderCancelled"] = "OrderCancelled";
    TradeActionType["OrderUpdated"] = "OrderUpdated";
    TradeActionType["OrderFrozen"] = "OrderFrozen";
})(TradeActionType || (TradeActionType = {}));
export function isPositionTradeAction(tradeAction) {
    return tradeAction.type === "position";
}
export function isSwapTradeAction(tradeAction) {
    return tradeAction.type === "swap";
}
