/**
 * DEX Components
 *
 * Business components for the DEX (decentralized exchange) module.
 * Components here are specific to DEX trading functionality.
 *
 * Categories:
 * - Trading: Position, Order, Trade components
 * - Charts: TradingView integration
 * - Markets: Market listing and selection
 * - Referrals: Referral system components
 * - Earn: Staking and earning components
 *
 * @note Components are re-exported from the legacy components/ folder
 * during the migration period. New components should be created directly here.
 */

// Trading Components
export { PositionList } from "components/PositionList/PositionList";
export { PositionItem } from "components/PositionItem/PositionItem";
export { PositionEditor } from "components/PositionEditor/PositionEditor";
export { OrderList } from "components/OrderList/OrderList";
export { OrderItem } from "components/OrderItem/OrderItem";
export { OrderEditor } from "components/OrderEditor/OrderEditor";

// Chart Components
export { default as TVChartContainer } from "components/TVChartContainer/TVChartContainer";
export { ChartTokenSelector } from "components/ChartTokenSelector/ChartTokenSelector";

// Market Components
export { MarketsList } from "components/MarketsList/MarketsList";

// Claim Components
export { Claims } from "components/Claims/Claims";
export { ClaimModal } from "components/ClaimModal/ClaimModal";

// Trade History
export { TradeHistory } from "components/TradeHistory/TradeHistory";
