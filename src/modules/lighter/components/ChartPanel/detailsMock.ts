import type { MarketDetailsResponse } from "modules/lighter/api/custom/client";

type DetailsSummary = {
  marketName: string;
  minBtcAmount: string;
  minUsdAmount: string;
  priceSteps: string;
  maxLeverage: string;
  initialMarginFraction: string;
  maintenanceMarginFraction: string;
  closeOutMarginFraction: string;
  marketCap: string;
  fdv: string;
};

export type DetailsViewModel = {
  assetSymbol: string;
  assetName: string;
  description: string;
  summary: DetailsSummary;
};

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatOptionalCurrency(value: string | null | undefined): string {
  const parsed = value == null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? formatCurrency(parsed) : "-";
}

function formatAmount(value: string | null | undefined, fractionDigits = 6) {
  const parsed = value == null ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

// Show the tick / price step at its own precision (e.g. "0.01"), not forced to a
// fixed number of decimals (which would round 0.01 down to "0.0").
function formatTick(value: string | null | undefined): string {
  const parsed = value == null ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return String(parsed);
}

function formatPercentFromFraction(value: string | null | undefined): string {
  const parsed = value == null ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${(parsed * 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })}%`;
}

function normalizeSymbol(symbol: string) {
  return symbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
}

/**
 * 从真实 API 响应构造 Details 视图模型。无数据时返回 null。
 */
export function buildDetailsViewModel(details: MarketDetailsResponse | null | undefined): DetailsViewModel | null {
  if (!details) return null;

  const assetSymbol = normalizeSymbol(details.base_asset || details.symbol || "");

  return {
    assetSymbol,
    assetName: details.base_asset
      ? assetSymbol === details.base_asset.toUpperCase()
        ? getAssetDisplayName(assetSymbol)
        : details.base_asset
      : assetSymbol,
    description: details.description ?? "",
    summary: {
      marketName: details.market_name ?? "-",
      minBtcAmount: formatAmount(details.min_base_amount, 5),
      minUsdAmount: formatAmount(details.min_usd_amount, 6),
      priceSteps: formatTick(details.price_step),
      maxLeverage: details.max_leverage != null ? `${details.max_leverage}x` : "-",
      initialMarginFraction: formatPercentFromFraction(details.initial_margin_fraction),
      maintenanceMarginFraction: formatPercentFromFraction(details.maintenance_margin_fraction),
      closeOutMarginFraction: formatPercentFromFraction(details.close_out_margin_fraction),
      marketCap: formatOptionalCurrency(details.market_cap),
      fdv: formatOptionalCurrency(details.fully_diluted_valuation),
    },
  };
}

/**
 * 把 base_asset code 映射到人类可读全称(API 不返回全称,仅返回 BTC/ETH 等 code)。
 * 未知资产退回 code 本身。
 */
function getAssetDisplayName(code: string): string {
  const NAMES: Record<string, string> = {
    BTC: "Bitcoin",
    ETH: "Ethereum",
    SOL: "Solana",
    BNB: "BNB",
    XRP: "XRP",
    DOGE: "Dogecoin",
    ADA: "Cardano",
    AVAX: "Avalanche",
    MATIC: "Polygon",
    DOT: "Polkadot",
    LINK: "Chainlink",
    SUI: "Sui",
    APT: "Aptos",
    ARB: "Arbitrum",
    OP: "Optimism",
    TRX: "TRON",
    TON: "Toncoin",
  };
  return NAMES[code] ?? code;
}
