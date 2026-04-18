"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSwapTradeAction = exports.isPositionTradeAction = exports.TradeActionType = void 0;
var TradeActionType;
(function (TradeActionType) {
    TradeActionType["OrderCreated"] = "OrderCreated";
    TradeActionType["OrderExecuted"] = "OrderExecuted";
    TradeActionType["OrderCancelled"] = "OrderCancelled";
    TradeActionType["OrderUpdated"] = "OrderUpdated";
    TradeActionType["OrderFrozen"] = "OrderFrozen";
})(TradeActionType || (exports.TradeActionType = TradeActionType = {}));
function isPositionTradeAction(tradeAction) {
    return tradeAction.type === "position";
}
exports.isPositionTradeAction = isPositionTradeAction;
function isSwapTradeAction(tradeAction) {
    return tradeAction.type === "swap";
}
exports.isSwapTradeAction = isSwapTradeAction;
