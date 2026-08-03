import { t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import BigNumber from "bignumber.js";
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { fetchWalletBalanceSnapshot, type WalletBalanceSnapshot } from "@/shared/lib/canton-wallet/balances";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { ensureSpotMemberAuth } from "@/shared/lib/canton-wallet/memberAuth";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import styles from "./OrderForm.module.scss";
import { calculateOrderSummary, estimatedFillPrice, quantityForPercent } from "./orderFormMath";
import { spotApi, SpotApiError, type DepthResp } from "../../api/spotClient";
import { swapApi, SwapApiError } from "../../api/swapClient";
import { usePolling } from "../../hooks/usePolling";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { useSpotAssetPrecisions } from "../../hooks/useSpotAssetPrecisions";
import { formatSpotAssetAmount, spotAssetPrecision } from "../../model/assetPrecision";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET" | "SWAP";

const Decimal = BigNumber.clone({ DECIMAL_PLACES: 40, ROUNDING_MODE: BigNumber.ROUND_DOWN });
const MARKET_BAND = new Decimal("1.05");
const SWAP_TAKER_FEE_RATE = new Decimal("0.001");

type PercentOrderInput = {
  side: Side;
  percent: number;
  price: string;
  baseFree: string;
  quoteFree: string;
};

function balanceFree(asset: string, balances: { asset: string; free: string }[]): string {
  return balances.find((balance) => balance.asset.toUpperCase() === asset.toUpperCase())?.free ?? "0";
}

function positiveDecimal(value: string): BigNumber | null {
  const number = new Decimal(value);
  return number.isFinite() && number.gt(0) ? number : null;
}

function nonNegativeDecimal(value: string): BigNumber | null {
  const number = new Decimal(value);
  return number.isFinite() && number.gte(0) ? number : null;
}

function minimumDecimal(left: BigNumber | null, right: BigNumber | null): BigNumber | null {
  if (left === null || right === null) return null;
  return BigNumber.minimum(left, right);
}

function quantityForOrderPercent(input: PercentOrderInput): string {
  return quantityForPercent(input);
}

function isWithinAvailableBalance(
  side: Side,
  price: string,
  amount: string,
  baseFree: string,
  quoteFree: string
): boolean {
  const parsedPrice = positiveDecimal(price);
  const parsedAmount = positiveDecimal(amount);
  if (parsedPrice === null || parsedAmount === null) return false;

  if (side === "SELL") {
    const balance = new Decimal(baseFree);
    return balance.isFinite() && parsedAmount.lte(balance);
  }

  const balance = new Decimal(quoteFree);
  return balance.isFinite() && parsedPrice.times(parsedAmount).lte(balance);
}

function walletAssetBalance(snapshot: WalletBalanceSnapshot | null, asset: string): BigNumber | null {
  if (snapshot?.status !== "ready") return null;
  const value = snapshot.balances.find((balance) => balance.symbol.toUpperCase() === asset.toUpperCase())?.amount;
  if (value === null || value === undefined) return null;
  const parsed = new Decimal(value);
  return parsed.isFinite() && parsed.gte(0) ? parsed : null;
}

function maximumSwapBase(
  side: Side,
  walletAvailable: BigNumber | null,
  levels: [string, string][] | undefined,
  slippageBps: number
): BigNumber | null {
  if (walletAvailable === null) return null;
  const touch = positiveDecimal(levels?.[0]?.[0] ?? "");
  if (touch === null) return null;
  const slippage = new Decimal(slippageBps).div(10_000);
  const boundary =
    side === "BUY" ? touch.times(new Decimal(1).plus(slippage)) : touch.times(new Decimal(1).minus(slippage));

  let quoteRemaining = walletAvailable;
  let baseAmount = new Decimal(0);
  for (const [levelPrice, levelQuantity] of levels ?? []) {
    const price = positiveDecimal(levelPrice);
    const quantity = positiveDecimal(levelQuantity);
    if (price === null || quantity === null) continue;
    if ((side === "BUY" && price.gt(boundary)) || (side === "SELL" && price.lt(boundary))) break;
    if (side === "SELL") {
      baseAmount = baseAmount.plus(quantity);
      if (baseAmount.gte(walletAvailable)) return walletAvailable;
      continue;
    }
    const levelCost = price.times(quantity);
    const fill = quoteRemaining.gte(levelCost) ? quantity : quoteRemaining.div(price);
    baseAmount = baseAmount.plus(fill);
    quoteRemaining = quoteRemaining.minus(fill.times(price));
    if (quoteRemaining.lte(0)) break;
  }
  return baseAmount;
}

function requiredSwapInput(side: Side, amount: string, fillPrice: string): BigNumber | null {
  const parsedAmount = positiveDecimal(amount);
  if (parsedAmount === null) return null;
  if (side === "SELL") return parsedAmount;
  const parsedPrice = positiveDecimal(fillPrice);
  return parsedPrice === null ? null : parsedAmount.times(parsedPrice);
}

/// The protective limit a MARKET order is submitted with: the touch pushed 5%
/// through the book so the order always crosses. It is the WORST price the
/// order may accept, not the price it is expected to get — see
/// [`estimatedFillPrice`] for what the user is shown.
function marketPrice(side: Side, bestAsk: string | undefined, bestBid: string | undefined): string {
  const source = positiveDecimal(side === "BUY" ? bestAsk ?? "" : bestBid ?? "");
  if (source === null) return "";
  return side === "BUY"
    ? source.times(MARKET_BAND).toFixed()
    : source.times(new Decimal(2).minus(MARKET_BAND)).toFixed();
}

export function SpotOrderForm({ market }: { market: SpotMarket }) {
  const { i18n } = useLingui();
  const { ready, account, err: accountError, refetch } = useSpotAccount();
  const wallet = useCantonSession();
  const precisions = useSpotAssetPrecisions();
  const marketSession = useRef({ symbol: market.apiSymbol, generation: 0 });
  const swapIntent = useRef<{ key: string; clientSwapId: string } | null>(null);
  const sideTabRefs = useRef<Record<Side, HTMLButtonElement | null>>({ BUY: null, SELL: null });
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(0);
  const [swapSlippageBps, setSwapSlippageBps] = useState(50);
  const [walletBalances, setWalletBalances] = useState<WalletBalanceSnapshot | null>(null);
  const [activeSwapId, setActiveSwapId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { displayBase: base, displayQuote: quote } = market;
  const balances = account?.balances ?? [];
  const baseFree = balanceFree(market.apiBase, balances);
  const quoteFree = balanceFree(market.apiQuote, balances);
  // 20 levels: enough to volume-weight a realistic market order. One level
  // only gives the touch, which is why Est. Price used to fall back to the
  // protective limit.
  const { data: depth } = usePolling<DepthResp>(() => spotApi.depth(market.apiSymbol, 20), 5000, [market.apiSymbol], {
    enabled: orderType === "MARKET" || orderType === "SWAP",
  });
  const { data: activeSwap } = usePolling(() => swapApi.get(activeSwapId as string), 1000, [activeSwapId], {
    enabled: activeSwapId !== null,
  });
  const { data: swapCapacity } = usePolling(
    () => swapApi.capacity(market.apiSymbol, side, swapSlippageBps),
    5000,
    [market.apiSymbol, side, swapSlippageBps],
    { enabled: orderType === "SWAP" && wallet.connected }
  );
  // Submission price: the protective limit (5% through the book). Balance
  // checks and percent sizing use it too, because that is what the backend
  // locks against.
  const effectivePrice =
    orderType === "LIMIT"
      ? price
      : orderType === "MARKET"
        ? marketPrice(side, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0])
        : "";
  // Displayed price: what the order is expected to fill at.
  const displayPrice =
    orderType === "LIMIT"
      ? price
      : orderType === "MARKET"
        ? estimatedFillPrice(side === "BUY" ? depth?.asks : depth?.bids, amount)
        : "";
  const availableValue = side === "BUY" ? quoteFree : baseFree;
  const availableAsset = side === "BUY" ? quote : base;
  const swapInputAsset = side === "BUY" ? quote : base;
  const swapOutputAsset = side === "BUY" ? base : quote;
  const swapEstimatedPrice = useMemo(
    () => estimatedFillPrice(side === "BUY" ? depth?.asks : depth?.bids, amount),
    [amount, depth?.asks, depth?.bids, side]
  );
  const swapFeePreview = useMemo(() => {
    const parsedAmount = positiveDecimal(amount);
    const parsedPrice = positiveDecimal(swapEstimatedPrice);
    const tradingFee =
      parsedAmount === null
        ? null
        : side === "BUY"
          ? parsedAmount.times(SWAP_TAKER_FEE_RATE)
          : parsedPrice?.times(parsedAmount).times(SWAP_TAKER_FEE_RATE) ?? null;
    const one = new Decimal(1);
    const gasFee = side === "SELL" ? one : parsedPrice?.gt(0) ? one.div(parsedPrice) : null;

    return {
      tradingFee: tradingFee?.toFixed() ?? null,
      gasFee: gasFee?.toFixed() ?? null,
    };
  }, [amount, side, swapEstimatedPrice]);
  const matchingActiveSwap = activeSwap?.symbol === market.apiSymbol && activeSwap.side === side ? activeSwap : null;
  const tradingFeeAsset = matchingActiveSwap?.feeAsset || swapOutputAsset;
  const tradingFeeAmount = matchingActiveSwap?.fee || swapFeePreview.tradingFee;
  const gasFeeAsset = matchingActiveSwap?.gasFeeAsset || swapOutputAsset;
  const gasFeeAmount = matchingActiveSwap?.gasFeeAmount || swapFeePreview.gasFee;
  const totalFeeAmount = useMemo(() => {
    if (!tradingFeeAmount || !gasFeeAmount || tradingFeeAsset.toUpperCase() !== gasFeeAsset.toUpperCase()) return null;
    const trading = positiveDecimal(tradingFeeAmount);
    const gas = positiveDecimal(gasFeeAmount);
    return trading && gas ? trading.plus(gas).toFixed() : null;
  }, [gasFeeAmount, gasFeeAsset, tradingFeeAmount, tradingFeeAsset]);
  const walletAvailable = walletAssetBalance(walletBalances, swapInputAsset);
  const walletMaximumSwapBase = useMemo(
    () => maximumSwapBase(side, walletAvailable, side === "BUY" ? depth?.asks : depth?.bids, swapSlippageBps),
    [depth?.asks, depth?.bids, side, swapSlippageBps, walletAvailable]
  );
  const matchingSwapCapacity =
    swapCapacity?.symbol === market.apiSymbol &&
    swapCapacity.side === side &&
    swapCapacity.outputAsset.toUpperCase() === swapOutputAsset.toUpperCase()
      ? swapCapacity
      : null;
  const custodyMaximumSwapBase = nonNegativeDecimal(matchingSwapCapacity?.maxBase ?? "");
  const effectiveMinimumSwapBase = positiveDecimal(matchingSwapCapacity?.effectiveMinBase ?? "");
  const swapBasePrecision = spotAssetPrecision(base, precisions);
  const sliderMinimumSwapBase = effectiveMinimumSwapBase
    ?.plus(new Decimal(1).shiftedBy(-swapBasePrecision))
    .decimalPlaces(swapBasePrecision, BigNumber.ROUND_UP);
  const swapSizingMaximumBase = useMemo(
    () => minimumDecimal(walletMaximumSwapBase, custodyMaximumSwapBase),
    [custodyMaximumSwapBase, walletMaximumSwapBase]
  );
  const requiredInput = requiredSwapInput(side, amount, swapEstimatedPrice);
  const parsedSwapAmount = positiveDecimal(amount);
  const swapBalanceInsufficient =
    walletAvailable !== null && requiredInput !== null && requiredInput.gt(walletAvailable);
  const swapMaximumExceeded =
    parsedSwapAmount !== null && custodyMaximumSwapBase !== null && parsedSwapAmount.gt(custodyMaximumSwapBase);
  // The backend threshold is a strict lower boundary: at equality the output
  // is entirely consumed by the trading fee and fixed execution cost.
  const swapMinimumNotMet =
    parsedSwapAmount !== null && effectiveMinimumSwapBase !== null && parsedSwapAmount.lte(effectiveMinimumSwapBase);
  const summary = useMemo(() => calculateOrderSummary(side, displayPrice, amount), [amount, displayPrice, side]);

  const selectSide = (nextSide: Side) => {
    const nextEffectivePrice =
      orderType === "LIMIT" ? price : marketPrice(nextSide, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0]);
    setSide(nextSide);
    setAmount(
      percent === 0
        ? ""
        : quantityForOrderPercent({
            side: nextSide,
            percent,
            price: nextEffectivePrice,
            baseFree,
            quoteFree,
          })
    );
    setMsg(null);
  };

  const selectOrderType = (nextType: OrderType) => {
    if (nextType === "SWAP") {
      setOrderType(nextType);
      setAmount("");
      setPercent(0);
      setMsg(null);
      return;
    }
    const nextEffectivePrice =
      nextType === "LIMIT" ? price : marketPrice(side, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0]);
    setOrderType(nextType);
    setAmount(
      percent === 0 ? "" : quantityForOrderPercent({ side, percent, price: nextEffectivePrice, baseFree, quoteFree })
    );
    setMsg(null);
  };

  const activateSideFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentSide: Side) => {
    let nextSide: Side | null = null;
    if (event.key === "Home") nextSide = "BUY";
    if (event.key === "End") nextSide = "SELL";
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextSide = currentSide === "BUY" ? "SELL" : "BUY";
    }
    if (!nextSide) return;

    event.preventDefault();
    if (nextSide !== side) selectSide(nextSide);
    sideTabRefs.current[nextSide]?.focus();
  };

  const updateAmount = (value: string) => {
    setAmount(value);
    if (orderType !== "SWAP" || !swapSizingMaximumBase?.gt(0)) {
      setPercent(0);
      return;
    }
    const parsed = positiveDecimal(value);
    const nextPercent = parsed
      ? parsed.div(swapSizingMaximumBase).times(100).integerValue(BigNumber.ROUND_DOWN).toNumber()
      : 0;
    setPercent(Math.max(0, Math.min(100, nextPercent)));
  };

  const updatePrice = (value: string) => {
    setPrice(value);
    if (percent === 0) return;
    setAmount(
      quantityForOrderPercent({
        side,
        percent,
        price: value,
        baseFree,
        quoteFree,
      })
    );
  };

  const updatePercent = (value: number) => {
    setPercent(value);
    setAmount(
      quantityForOrderPercent({
        side,
        percent: value,
        price: effectivePrice,
        baseFree,
        quoteFree,
      })
    );
  };

  const updateSwapPercent = (value: number) => {
    let nextPercent = Math.max(0, Math.min(100, value));
    if (nextPercent > 0 && swapSizingMaximumBase?.gt(0) && effectiveMinimumSwapBase?.gt(0)) {
      const minimumPercent = (sliderMinimumSwapBase ?? effectiveMinimumSwapBase)
        .div(swapSizingMaximumBase)
        .times(100)
        .integerValue(BigNumber.ROUND_CEIL)
        .toNumber();
      nextPercent = Math.min(100, Math.max(nextPercent, minimumPercent));
    }
    setPercent(nextPercent);
    if (!swapSizingMaximumBase?.gt(0) || nextPercent === 0) {
      setAmount("");
      return;
    }
    const sizedAmount = swapSizingMaximumBase
      .times(nextPercent)
      .div(100)
      .decimalPlaces(swapBasePrecision, BigNumber.ROUND_DOWN);
    const executableAmount =
      effectiveMinimumSwapBase && sizedAmount.lte(effectiveMinimumSwapBase)
        ? sliderMinimumSwapBase ?? effectiveMinimumSwapBase
        : sizedAmount;
    setAmount(executableAmount.toFixed());
  };

  useEffect(() => {
    if (orderType !== "SWAP" || !wallet.connected) {
      setWalletBalances(null);
      return;
    }
    let alive = true;
    void fetchWalletBalanceSnapshot().then((snapshot) => {
      if (alive) setWalletBalances(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [market.apiSymbol, orderType, wallet.connected, wallet.party, wallet.provider]);

  useEffect(() => {
    if (orderType === "SWAP" || percent === 0 || busy) return;
    const nextAmount = quantityForOrderPercent({ side, percent, price: effectivePrice, baseFree, quoteFree });
    setAmount((currentAmount) => (currentAmount === nextAmount ? currentAmount : nextAmount));
  }, [baseFree, busy, effectivePrice, orderType, percent, quoteFree, side]);

  useLayoutEffect(() => {
    if (marketSession.current.symbol === market.apiSymbol) return;
    marketSession.current = {
      symbol: market.apiSymbol,
      generation: marketSession.current.generation + 1,
    };
    setSide("BUY");
    setOrderType("LIMIT");
    setPrice("");
    setAmount("");
    setPercent(0);
    setSwapSlippageBps(50);
    setWalletBalances(null);
    setMsg(null);
    setBusy(false);
    setActiveSwapId(null);
    swapIntent.current = null;
  }, [market.apiSymbol]);

  useEffect(() => {
    if (!activeSwap || activeSwap.swapId !== activeSwapId) return;
    if (activeSwap.status === "CONFIRMED") {
      setMsg({
        kind: "ok",
        text: `${i18n._(t`Swap confirmed`)} · ${activeSwap.cantonUpdateId?.slice(0, 12) ?? activeSwap.swapId.slice(0, 12)}…`,
      });
      setActiveSwapId(null);
      return;
    }
    if (["CANCELLED", "FAILED_NO_FILL", "FAILED_CHAIN"].includes(activeSwap.status)) {
      setMsg({
        kind: "err",
        text: activeSwap.lastError || `${i18n._(t`Swap failed`)} · ${activeSwap.status}`,
      });
      setActiveSwapId(null);
      return;
    }
    setMsg({ kind: "ok", text: `${i18n._(t`Swap processing`)} · ${activeSwap.status}` });
  }, [activeSwap, activeSwapId, i18n]);

  const canSubmit =
    ready &&
    account?.canTrade === true &&
    !busy &&
    isWithinAvailableBalance(side, effectivePrice, amount, baseFree, quoteFree);
  const canSubmitSwap =
    wallet.connected &&
    !wallet.locked &&
    !busy &&
    activeSwapId === null &&
    positiveDecimal(amount) !== null &&
    custodyMaximumSwapBase !== null &&
    effectiveMinimumSwapBase !== null &&
    swapSlippageBps >= 10 &&
    swapSlippageBps <= 500 &&
    !swapBalanceInsufficient &&
    !swapMinimumNotMet &&
    !swapMaximumExceeded;

  const submit = async () => {
    if (!canSubmit || orderType === "SWAP") return;
    const submittedSession = marketSession.current;
    const isCurrentSession = () =>
      marketSession.current.symbol === submittedSession.symbol &&
      marketSession.current.generation === submittedSession.generation;
    setBusy(true);
    setMsg(null);
    try {
      const response = await spotApi.placeOrder({
        symbol: market.apiSymbol,
        side,
        type: orderType,
        ...(orderType === "LIMIT" ? { price } : {}),
        quantity: amount,
      });
      if (!isCurrentSession()) return;
      const confirmation = side === "BUY" ? i18n._(t`Buy order submitted`) : i18n._(t`Sell order submitted`);
      setMsg({ kind: "ok", text: `${confirmation} · ${response.orderId.slice(0, 12)}…` });
      if (orderType === "LIMIT") setPrice("");
      setAmount("");
      setPercent(0);
      refetch();
    } catch (error: unknown) {
      if (!isCurrentSession()) return;
      const text =
        error instanceof SpotApiError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      setMsg({ kind: "err", text });
    } finally {
      if (isCurrentSession()) setBusy(false);
    }
  };

  const submitSwap = async () => {
    if (!canSubmitSwap) return;
    const submittedSession = marketSession.current;
    const isCurrentSession = () =>
      marketSession.current.symbol === submittedSession.symbol &&
      marketSession.current.generation === submittedSession.generation;
    setBusy(true);
    setMsg(null);
    try {
      const [freshBalances, freshDepth, freshCapacity] = await Promise.all([
        fetchWalletBalanceSnapshot(),
        spotApi.depth(market.apiSymbol, 20),
        swapApi.capacity(market.apiSymbol, side, swapSlippageBps),
      ]);
      if (!isCurrentSession()) return;
      setWalletBalances(freshBalances);
      const freshAvailable = walletAssetBalance(freshBalances, swapInputAsset);
      const freshFillPrice = estimatedFillPrice(side === "BUY" ? freshDepth.asks : freshDepth.bids, amount);
      const freshRequired = requiredSwapInput(side, amount, freshFillPrice);
      if (freshAvailable === null || freshRequired === null) {
        setMsg({ kind: "err", text: i18n._(t`Balance unavailable.`) });
        return;
      }
      if (freshRequired.gt(freshAvailable)) {
        setMsg({ kind: "err", text: i18n._(t`Insufficient ${swapInputAsset} balance`) });
        return;
      }
      const freshCustodyMaximum = nonNegativeDecimal(freshCapacity.maxBase);
      const freshEffectiveMinimum = positiveDecimal(freshCapacity.effectiveMinBase);
      const submittedAmount = positiveDecimal(amount);
      if (
        freshCapacity.symbol !== market.apiSymbol ||
        freshCapacity.side !== side ||
        freshCapacity.outputAsset.toUpperCase() !== swapOutputAsset.toUpperCase() ||
        freshCustodyMaximum === null ||
        freshEffectiveMinimum === null ||
        submittedAmount === null ||
        submittedAmount.gt(freshCustodyMaximum)
      ) {
        setMsg({ kind: "err", text: i18n._(t`Amount exceeds the single Swap maximum`) });
        return;
      }
      if (submittedAmount.lte(freshEffectiveMinimum)) {
        setMsg({ kind: "err", text: i18n._(t`Amount is below the minimum Swap amount`) });
        return;
      }
      const newlyAuthorized = await ensureSpotMemberAuth({ provider: wallet.provider, party: wallet.party });
      if (!isCurrentSession()) return;
      if (newlyAuthorized) {
        setMsg({
          kind: "ok",
          text: i18n._(t`Wallet authorization completed. Review the refreshed market and confirm Swap again.`),
        });
        return;
      }
      const intentKey = `${market.apiSymbol}:${side}:${amount}:${swapSlippageBps}`;
      if (swapIntent.current?.key !== intentKey) {
        swapIntent.current = { key: intentKey, clientSwapId: crypto.randomUUID() };
      }
      const response = await swapApi.create({
        clientSwapId: swapIntent.current.clientSwapId,
        symbol: market.apiSymbol,
        side,
        amount,
        slippageBps: swapSlippageBps,
      });
      if (!isCurrentSession()) return;
      setMsg({ kind: "ok", text: `${i18n._(t`Swap submitted`)} · ${response.swapId.slice(0, 12)}…` });
      setActiveSwapId(response.swapId);
      setAmount("");
      swapIntent.current = null;
    } catch (error: unknown) {
      if (!isCurrentSession()) return;
      const text =
        error instanceof SwapApiError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      setMsg({ kind: "err", text });
    } finally {
      if (isCurrentSession()) setBusy(false);
    }
  };

  const sliderStyle = { "--slider-fill": `${percent}%` } as CSSProperties;

  return (
    <div className={styles.panel}>
      <div className={styles.orderTypeTabs} role="tablist" aria-label="Order type">
        <button
          type="button"
          id="spot-market-tab"
          role="tab"
          aria-selected={orderType === "MARKET"}
          aria-controls="spot-order-form-panel"
          tabIndex={orderType === "MARKET" && !busy ? 0 : -1}
          disabled={busy}
          className={orderType === "MARKET" ? styles.orderTypeActive : undefined}
          onClick={() => selectOrderType("MARKET")}
        >
          <Trans>Market</Trans>
        </button>
        <button
          type="button"
          id="spot-limit-tab"
          role="tab"
          aria-selected={orderType === "LIMIT"}
          aria-controls="spot-order-form-panel"
          tabIndex={orderType === "LIMIT" && !busy ? 0 : -1}
          disabled={busy}
          className={orderType === "LIMIT" ? styles.orderTypeActive : undefined}
          onClick={() => selectOrderType("LIMIT")}
        >
          <Trans>Limit</Trans>
        </button>
        <button
          type="button"
          id="spot-swap-tab"
          role="tab"
          aria-selected={orderType === "SWAP"}
          aria-controls="spot-swap-panel"
          tabIndex={orderType === "SWAP" && !busy ? 0 : -1}
          disabled={busy}
          className={orderType === "SWAP" ? styles.orderTypeActive : undefined}
          onClick={() => selectOrderType("SWAP")}
        >
          <Trans>Swap</Trans>
        </button>
      </div>

      {orderType === "SWAP" ? (
        <>
          <div className={styles.sideTabs} role="tablist" aria-label="Swap side">
            <button
              type="button"
              className={styles.sideTab}
              aria-selected={side === "BUY"}
              onClick={() => selectSide("BUY")}
            >
              <Trans>Buy</Trans> {base}
            </button>
            <button
              type="button"
              className={styles.sideTab}
              aria-selected={side === "SELL"}
              onClick={() => selectSide("SELL")}
            >
              <Trans>Sell</Trans> {base}
            </button>
            <div
              aria-hidden="true"
              className={`${styles.sideIndicator} ${side === "BUY" ? styles.indicatorBuy : styles.indicatorSell}`}
            />
          </div>
          <div
            id="spot-swap-panel"
            role="tabpanel"
            aria-labelledby="spot-swap-tab"
            className={`${styles.body} ${styles.swapBody}`}
          >
            <div className={styles.swapIntro}>
              <span className={styles.swapKicker}>
                <Trans>Onchain atomic swap</Trans>
              </span>
              <strong>
                <Trans>Swap directly from your wallet</Trans>
              </strong>
              <p>
                <Trans>
                  Your swap is matched against available market liquidity. Review the estimated amount and price before
                  confirming.
                </Trans>
              </p>
            </div>

            <div className={styles.swapRoute} aria-label="Swap route preview">
              <div className={styles.swapLeg}>
                <span>
                  <Trans>You pay</Trans>
                </span>
                <strong>{side === "BUY" ? quote : base}</strong>
                <small>
                  <Trans>Your wallet</Trans>
                </small>
              </div>
              <div className={styles.swapArrow} aria-hidden="true">
                ↓
              </div>
              <div className={styles.swapLeg}>
                <span>
                  <Trans>You receive</Trans>
                </span>
                <strong>{side === "BUY" ? base : quote}</strong>
                <small>
                  <Trans>To your wallet</Trans>
                </small>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="spot-swap-amount" className={styles.fieldLabel}>
                <Trans>Amount</Trans>
              </label>
              <input
                id="spot-swap-amount"
                aria-label={`Swap amount (${base})`}
                className={styles.input}
                value={amount}
                onChange={(event) => updateAmount(event.target.value)}
                disabled={busy}
                placeholder="0.1"
                inputMode="decimal"
                autoComplete="off"
              />
              <span className={styles.unit}>{base}</span>
            </div>

            <div className={styles.sliderBlock}>
              <input
                aria-label="Swap percentage"
                className={`${styles.slider} ${side === "BUY" ? styles.sliderBuy : styles.sliderSell}`}
                style={sliderStyle}
                type="range"
                min="0"
                max="100"
                step="1"
                value={percent}
                onChange={(event) => updateSwapPercent(Number(event.target.value))}
                disabled={
                  busy ||
                  !swapSizingMaximumBase?.gt(0) ||
                  (effectiveMinimumSwapBase !== null && effectiveMinimumSwapBase.gte(swapSizingMaximumBase))
                }
              />
              <div className={styles.percentInput}>
                <input
                  aria-label="Swap percentage input"
                  className={styles.percentInputValue}
                  value={percent}
                  inputMode="numeric"
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(/[^0-9]/g, ""));
                    if (!Number.isNaN(next)) updateSwapPercent(next);
                  }}
                  disabled={
                    busy ||
                    !swapSizingMaximumBase?.gt(0) ||
                    (effectiveMinimumSwapBase !== null && effectiveMinimumSwapBase.gte(swapSizingMaximumBase))
                  }
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>

            <div className={styles.swapMaximum}>
              <span>
                <Trans>Minimum Swap amount</Trans>
              </span>
              <strong>
                {effectiveMinimumSwapBase
                  ? formatSpotAssetAmount(effectiveMinimumSwapBase.toFixed(), base, precisions)
                  : "—"}{" "}
                {base}
              </strong>
              <small>
                <Trans>Includes trading fee and network fee</Trans>
              </small>
            </div>

            <div className={styles.swapMaximum}>
              <span>
                <Trans>Single Swap maximum</Trans>
              </span>
              <strong>
                {custodyMaximumSwapBase
                  ? formatSpotAssetAmount(custodyMaximumSwapBase.toFixed(), base, precisions)
                  : "—"}{" "}
                {base}
              </strong>
              <small>
                <Trans>Limited to 80% of current custody liquidity</Trans> ·{" "}
                {matchingSwapCapacity?.outputAsset || swapOutputAsset}
              </small>
            </div>

            <div className={styles.field}>
              <label htmlFor="spot-swap-slippage" className={styles.fieldLabel}>
                <Trans>Max slippage</Trans>
              </label>
              <input
                id="spot-swap-slippage"
                aria-label="Swap slippage"
                className={styles.input}
                value={(swapSlippageBps / 100).toString()}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setSwapSlippageBps(Math.round(value * 100));
                }}
                disabled={busy}
                inputMode="decimal"
              />
              <span className={styles.unit}>%</span>
            </div>

            <div className={styles.swapNotice}>
              <Trans>
                Amount is the maximum base asset quantity. Available depth may reduce the fill; insufficient wallet or
                custody balance is rejected. Actual fills update trades, volume, and candles.
              </Trans>
            </div>

            <div className={styles.swapFees} aria-label="Swap fees">
              <div className={styles.swapFeeRow} aria-label="Swap trading fee">
                <span>
                  <Trans>Trading fee</Trans>
                </span>
                <strong>
                  {tradingFeeAmount ? `≈ ${formatSpotAssetAmount(tradingFeeAmount, tradingFeeAsset, precisions)}` : "—"}{" "}
                  {tradingFeeAsset}
                </strong>
                <small>0.1%</small>
              </div>
              <div className={styles.swapFeeRow} aria-label="Swap gas fee">
                <span>
                  <Trans>Network Fee</Trans>
                </span>
                <strong>
                  {gasFeeAmount ? `≈ ${formatSpotAssetAmount(gasFeeAmount, gasFeeAsset, precisions)}` : "—"}{" "}
                  {gasFeeAsset}
                </strong>
              </div>
              <div className={`${styles.swapFeeRow} ${styles.swapFeeTotal}`} aria-label="Swap total fees">
                <span>
                  <Trans>Total</Trans>
                </span>
                <strong>
                  {totalFeeAmount ? `≈ ${formatSpotAssetAmount(totalFeeAmount, gasFeeAsset, precisions)}` : "—"}{" "}
                  {gasFeeAsset}
                </strong>
              </div>
            </div>

            {wallet.connected ? (
              <button
                type="button"
                className={`${styles.submit} ${styles.swapSubmit}`}
                disabled={!canSubmitSwap}
                onClick={submitSwap}
              >
                {busy ? (
                  <Trans>Sending…</Trans>
                ) : swapBalanceInsufficient ? (
                  <Trans>Insufficient {swapInputAsset} balance</Trans>
                ) : swapMaximumExceeded ? (
                  <Trans>Exceeds single Swap limit</Trans>
                ) : swapMinimumNotMet ? (
                  <Trans>Below minimum Swap amount</Trans>
                ) : side === "BUY" ? (
                  <Trans>Swap to buy</Trans>
                ) : (
                  <Trans>Swap to sell</Trans>
                )}{" "}
                {base}
              </button>
            ) : (
              <button type="button" className={`${styles.submit} ${styles.connect}`} onClick={openCantonConnect}>
                <Trans>Connect Wallet</Trans>
              </button>
            )}
            {msg && (
              <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`} role="status">
                {msg.text}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.sideTabs} role="tablist" aria-label="Order side">
            <button
              type="button"
              id="spot-buy-tab"
              role="tab"
              aria-selected={side === "BUY"}
              aria-controls="spot-order-form-panel"
              tabIndex={side === "BUY" && !busy ? 0 : -1}
              disabled={busy}
              className={styles.sideTab}
              onClick={() => selectSide("BUY")}
              onKeyDown={(event) => activateSideFromKeyboard(event, "BUY")}
              ref={(node) => {
                sideTabRefs.current.BUY = node;
              }}
            >
              <Trans>Buy</Trans> {base}
            </button>
            <button
              type="button"
              id="spot-sell-tab"
              role="tab"
              aria-selected={side === "SELL"}
              aria-controls="spot-order-form-panel"
              tabIndex={side === "SELL" && !busy ? 0 : -1}
              disabled={busy}
              className={styles.sideTab}
              onClick={() => selectSide("SELL")}
              onKeyDown={(event) => activateSideFromKeyboard(event, "SELL")}
              ref={(node) => {
                sideTabRefs.current.SELL = node;
              }}
            >
              <Trans>Sell</Trans> {base}
            </button>
            <div
              aria-hidden="true"
              data-testid="spot-side-indicator"
              className={`${styles.sideIndicator} ${side === "BUY" ? styles.indicatorBuy : styles.indicatorSell}`}
            />
          </div>

          <div
            id="spot-order-form-panel"
            role="tabpanel"
            aria-labelledby={`spot-${side.toLowerCase()}-tab spot-${orderType.toLowerCase()}-tab`}
            className={styles.body}
          >
            <div className={styles.available}>
              <span>
                <Trans>Available</Trans>
              </span>
              <strong>
                {account ? formatSpotAssetAmount(availableValue, availableAsset, precisions) : "—"} {availableAsset}
              </strong>
            </div>
            {accountError && <div className={styles.accountHint}>{accountError}</div>}

            <div className={`${styles.field} ${orderType === "MARKET" ? styles.readOnlyShell : ""}`}>
              <label htmlFor="spot-order-price" className={styles.fieldLabel}>
                {orderType === "MARKET" ? <Trans>Est. Price</Trans> : <Trans>Price</Trans>}
              </label>
              <input
                id="spot-order-price"
                aria-label={`Price (${quote})`}
                className={styles.input}
                value={orderType === "MARKET" && displayPrice ? displayPrice : price}
                onChange={(event) => updatePrice(event.target.value)}
                disabled={busy}
                placeholder={orderType === "MARKET" ? "—" : "500"}
                inputMode="decimal"
                autoComplete="off"
                readOnly={orderType === "MARKET"}
                tabIndex={orderType === "MARKET" ? -1 : undefined}
              />
              <span className={styles.unit}>{quote}</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="spot-order-amount" className={styles.fieldLabel}>
                <Trans>Amount</Trans>
              </label>
              <input
                id="spot-order-amount"
                aria-label={`Amount (${base})`}
                className={styles.input}
                value={amount}
                onChange={(event) => updateAmount(event.target.value)}
                disabled={busy}
                placeholder="0.1"
                inputMode="decimal"
                autoComplete="off"
              />
              <span className={styles.unit}>{base}</span>
            </div>

            <div className={styles.sliderBlock}>
              <input
                aria-label="Order percentage"
                className={`${styles.slider} ${side === "BUY" ? styles.sliderBuy : styles.sliderSell}`}
                style={sliderStyle}
                type="range"
                min="0"
                max="100"
                step="1"
                value={percent}
                onChange={(event) => updatePercent(Number(event.target.value))}
                disabled={busy}
              />
              <div className={styles.percentInput}>
                <input
                  aria-label="Order percentage input"
                  className={styles.percentInputValue}
                  value={percent}
                  inputMode="numeric"
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(/[^0-9]/g, ""));
                    if (!Number.isNaN(next)) updatePercent(Math.max(0, Math.min(100, next)));
                  }}
                  disabled={busy}
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>

            <div className={`${styles.field} ${styles.readOnlyShell}`}>
              <label htmlFor="spot-order-total" className={styles.fieldLabel}>
                <Trans>Total</Trans>
              </label>
              <input
                id="spot-order-total"
                aria-label={`Total (${quote})`}
                className={styles.input}
                value={summary.total}
                placeholder="0.00"
                readOnly
                tabIndex={-1}
              />
              <span className={styles.unit}>{quote}</span>
            </div>

            {ready ? (
              <button
                type="button"
                className={`${styles.submit} ${side === "BUY" ? styles.submitBuy : styles.submitSell}`}
                aria-label={busy ? "Sending…" : `${side} ${base}`}
                onClick={submit}
                disabled={!canSubmit}
              >
                {busy ? (
                  <Trans>Sending…</Trans>
                ) : (
                  <>
                    {side === "BUY" ? <Trans>BUY</Trans> : <Trans>SELL</Trans>} {base} ·{" "}
                    {orderType === "MARKET" ? <Trans>Market</Trans> : <Trans>Limit</Trans>}
                  </>
                )}
              </button>
            ) : (
              <button type="button" className={`${styles.submit} ${styles.connect}`} onClick={openCantonConnect}>
                <Trans>Connect Wallet</Trans>
              </button>
            )}

            <div className={styles.feeRow}>
              <span>
                <Trans>Fee</Trans> (0.1%)
              </span>
              <strong>
                {summary.fee ? `${summary.fee} ${side === "BUY" ? base : quote}` : `— ${side === "BUY" ? base : quote}`}
              </strong>
            </div>

            {msg && (
              <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`} role="status">
                {msg.text}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
