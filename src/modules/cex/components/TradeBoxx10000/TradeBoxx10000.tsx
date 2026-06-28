import { t, Trans } from "@lingui/macro";
import cx from "classnames";
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { useKey, useLatest, usePrevious } from "react-use";

import { BASIS_POINTS_DIVISOR, USD_DECIMALS } from "config/factors";
import { isSettlementChain } from "config/multichain";
import { useOpenMultichainDepositModal } from "context/GmxAccountContext/useOpenMultichainDepositModal";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import { useTokensData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import { selectChartHeaderInfo } from "context/SyntheticsStateContext/selectors/chartSelectors";
import { selectGasPaymentToken } from "context/SyntheticsStateContext/selectors/expressSelectors";
import {
  selectChainId,
  selectMarketsInfoData,
  selectPositionsInfoData,
  selectSrcChainId,
  selectSubaccountState,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import {
  selectExpressOrdersEnabled,
  selectGasPaymentTokenAddress,
  selectSetExpressOrdersEnabled,
  selectSettingsWarningDotVisible,
  selectShowDebugValues,
} from "context/SyntheticsStateContext/selectors/settingsSelectors";
import {
  selectTradeboxAllowedSlippage,
  selectTradeboxAvailableTokensOptions,
  selectTradeboxChooseSuitableMarket,
  selectTradeboxDecreasePositionAmounts,
  selectTradeboxExecutionFee,
  selectTradeboxFees,
  selectTradeboxFromToken,
  selectTradeboxIncreasePositionAmounts,
  selectTradeboxIsWrapOrUnwrap,
  selectTradeboxKeepLeverage,
  selectTradeboxLeverage,
  selectTradeboxLeverageSliderMarks,
  selectTradeboxMarkPrice,
  selectTradeboxMaxLeverage,
  selectTradeboxNextPositionValues,
  selectTradeboxSelectedPosition,
  selectTradeboxSelectedPositionKey,
  selectTradeboxSetDefaultAllowedSwapSlippageBps,
  selectTradeboxSetKeepLeverage,
  selectTradeboxSetSelectedAllowedSwapSlippageBps,
  selectTradeboxState,
  selectTradeboxSwapAmounts,
  selectTradeboxTradeFlags,
  selectTradeboxTradeRatios,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { toastEnableExpress } from "domain/multichain/toastEnableExpress";
import { useGmxAccountShowDepositButton } from "domain/multichain/useGmxAccountShowDepositButton";
import { getMinResidualGasPaymentTokenAmount } from "domain/synthetics/express/getMinResidualGasPaymentTokenAmount";
import { getMarketIndexName, MarketInfo } from "domain/synthetics/markets";
import { formatLeverage, formatLiquidationPrice } from "domain/synthetics/positions";
import { convertToTokenAmount, convertToUsd } from "domain/synthetics/tokens";
import { getTwapRecommendation } from "domain/synthetics/trade/twapRecommendation";
import { useMaxAutoCancelOrdersState } from "domain/synthetics/trade/useMaxAutoCancelOrdersState";
import { usePriceImpactWarningState } from "domain/synthetics/trade/usePriceImpactWarningState";
import { MissedCoinsPlace } from "domain/synthetics/userFeedback";
import { Token } from "domain/tokens";
import { useMaxAvailableAmount } from "domain/tokens/useMaxAvailableAmount";
import { helperToast } from "lib/helperToast";
import { useLocalizedMap } from "lib/i18n";
import {
  calculateDisplayDecimals,
  expandDecimals,
  formatAmount,
  formatAmountFree,
  formatBalanceAmount,
  formatDeltaUsd,
  formatPercentage,
  formatTokenAmountWithUsd,
  formatUsd,
  formatUsdPrice,
  parseValue,
} from "lib/numbers";
import { EMPTY_ARRAY, getByKey } from "lib/objects";
import { useCursorInside } from "lib/useCursorInside";
import { sendTradeBoxInteractionStartedEvent } from "lib/userAnalytics";
import { useWalletIconUrls } from "lib/wallets/getWalletIconUrls";
import { useIsNonEoaAccountOnAnyChain } from "lib/wallets/useAccountType";
import useWallet from "lib/wallets/useWallet";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { EXPRESS_DEFAULT_MIN_RESIDUAL_USD_NUMBER } from "sdk/configs/express";
import { getToken, getTokenBySymbol, getTokenBySymbolSafe, isUsdBasedStableToken, NATIVE_TOKEN_ADDRESS } from "sdk/configs/tokens";
import { TradeMode } from "sdk/types/trade";

import { AlertInfoCard } from "components/AlertInfo/AlertInfoCard";
import Button from "components/Button/Button";
import BuyInputSection from "components/BuyInputSection/BuyInputSection";
import { ColorfulBanner } from "components/ColorfulBanner/ColorfulBanner";
import { LeverageSlider } from "components/LeverageSlider/LeverageSlider";
import { MarketSelector } from "components/MarketSelector/MarketSelector";
import SuggestionInput from "components/SuggestionInput/SuggestionInput";
import { SyntheticsInfoRow } from "components/SyntheticsInfoRow";
import Tabs from "components/Tabs/Tabs";
import ToggleSwitch from "components/ToggleSwitch/ToggleSwitch";
import TokenIcon from "components/TokenIcon/TokenIcon";
import TokenWithIcon from "components/TokenIcon/TokenWithIcon";
import { MultichainTokenSelector } from "components/TokenSelector/MultichainTokenSelector";
import TokenSelector from "components/TokenSelector/TokenSelector";
import Tooltip from "components/Tooltip/Tooltip";
import { ValueTransition } from "components/ValueTransition/ValueTransition";

import ArrowDownIcon from "img/ic_arrow_down.svg?react";
import InfoCircleIcon from "img/ic_info_circle_stroke.svg?react";
import SettingsIcon from "img/ic_settings.svg?react";

import { useX10000State } from "@/modules/cex/store/X10000StateContext";
import { useX10000MarketsWithTickers, useX10000SelectedMarket } from "@/modules/cex/lib/api/custom/useX10000Markets";

import { useIsCurtainOpenx10000 } from "./Curtainx10000";
import { useMultichainTokensRequest } from "components/GmxAccountModal/hooks";
import { HighPriceImpactOrFeesWarningCard } from "components/HighPriceImpactOrFeesWarningCard/HighPriceImpactOrFeesWarningCard";
import TradeInfoIcon from "components/TradeInfoIcon/TradeInfoIcon";
import TwapRows from "components/TwapRows/TwapRows";
import { useDecreaseOrdersThatWillBeExecutedx10000 } from "./hooks/useDecreaseOrdersThatWillBeExecutedx10000";
import { useShowHighLeverageWarningx10000 } from "./hooks/useShowHighLeverageWarningx10000";
import { useTradeboxAcceptablePriceImpactValuesx10000 } from "./hooks/useTradeboxAcceptablePriceImpactValuesx10000";
import { useTradeboxTPSLResetx10000 } from "./hooks/useTradeboxTPSLResetx10000";
import { useTradeboxButtonStatex10000 } from "./hooks/useTradeButtonStatex10000";
import { tradeModeLabelsx10000, tradeTypeLabelsx10000 } from "./tradeboxConstantsx10000";
import { LimitAndTPSLGroupx10000 } from "./TradeBoxRowsx10000/LimitAndTPSLRowsx10000";
import { PriceImpactFeesRowx10000 } from "./TradeBoxRowsx10000/PriceImpactFeesRowx10000";

import "./TradeBoxx10000.scss";

export function TradeBoxx10000({ isMobile }: { isMobile: boolean }) {
  const localizedTradeModeLabels = useLocalizedMap(tradeModeLabelsx10000);
  const localizedTradeTypeLabels = useLocalizedMap(tradeTypeLabelsx10000);

  const setDefaultAllowedSwapSlippageBps = useSelector(selectTradeboxSetDefaultAllowedSwapSlippageBps);
  const setSelectedAllowedSwapSlippageBps = useSelector(selectTradeboxSetSelectedAllowedSwapSlippageBps);

  const availableTokenOptions = useSelector(selectTradeboxAvailableTokensOptions);
  const chartHeaderInfo = useSelector(selectChartHeaderInfo);
  const formRef = useRef<HTMLFormElement>(null);
  const isCursorInside = useCursorInside(formRef);
  // Removed for centralized version: showDebugValues, allowedSlippage handled server-side
  // const showDebugValues = useSelector(selectShowDebugValues);
  // const allowedSlippage = useSelector(selectTradeboxAllowedSlippage);

  const { swapTokens, infoTokens, sortedLongAndShortTokens, sortedAllMarkets, indexTokens } = availableTokenOptions;
  const tokensData = useTokensData();
  const { tokenChainDataArray: multichainTokens } = useMultichainTokensRequest();
  const marketsInfoData = useSelector(selectMarketsInfoData);
  const tradeFlags = useSelector(selectTradeboxTradeFlags);
  const { isLong, isSwap, isIncrease, isPosition, isLimit, isTrigger, isMarket, isTwap } = tradeFlags;
  const isWrapOrUnwrap = useSelector(selectTradeboxIsWrapOrUnwrap);

  const chainId = useSelector(selectChainId);
  const srcChainId = useSelector(selectSrcChainId);

  // X10000 state synchronization - fetch API markets early
  const { selectedSymbol, setSelectedSymbol } = useX10000State();
  const { markets: x10000Markets } = useX10000MarketsWithTickers(chainId);
  const x10000SelectedMarket = useX10000SelectedMarket(chainId, selectedSymbol);

  // For x10000 mode, filter swapTokens to only show USDT with account balance (from API), not wallet balance
  const filteredSwapTokensForX10000 = useMemo(() => {
    try {
      const usdtToken = getTokenBySymbol(chainId, "USDT");
      if (!usdtToken) return swapTokens;

      // Filter to only include USDT token
      const usdtTokens = swapTokens.filter((token) => token.address.toLowerCase() === usdtToken.address.toLowerCase());

      // Further filter: only include if tokensData shows this USDT has account balance (from API)
      if (!tokensData) return usdtTokens;

      const usdtTokenData = tokensData[usdtToken.address] || tokensData[usdtToken.address.toLowerCase()];
      if (!usdtTokenData) return [];

      // Only include if token has account balance (isAccount: true or accountBalance !== undefined)
      // This ensures we only show USDT from API balances, not wallet balances
      if (usdtTokenData.isAccount === true || usdtTokenData.accountBalance !== undefined) {
        return usdtTokens;
      }

      return [];
    } catch (e) {
      // eslint-disable-next-line no-console
      // console.warn("[TradeBoxx10000] USDT token not found, using all swapTokens:", e);
      return swapTokens;
    }
  }, [chainId, swapTokens, tokensData]);

  // For x10000 mode, filter tokensData to only show USDT with account balance (from API) for MultichainTokenSelector
  const filteredTokensDataForX10000 = useMemo(() => {
    try {
      const usdtToken = getTokenBySymbol(chainId, "USDT");
      if (!usdtToken || !tokensData) return tokensData;
      const usdtAddress = usdtToken.address.toLowerCase();
      const filtered: typeof tokensData = {};
      for (const [address, tokenData] of Object.entries(tokensData)) {
        if (address.toLowerCase() === usdtAddress) {
          // Only include if token has account balance (from API), not wallet balance
          // This ensures we only show USDT from API balances, not wallet balances
          if (tokenData.isAccount === true || tokenData.accountBalance !== undefined) {
            filtered[address] = tokenData;
          }
        }
      }
      return filtered;
    } catch (e) {
      // eslint-disable-next-line no-console
      // console.warn("[TradeBoxx10000] USDT token not found for tokensData filter, using all tokensData:", e);
      return tokensData;
    }
  }, [chainId, tokensData]);

  // Create indexTokens directly from API markets - no local config dependency
  // All tokens are created from API data
  const apiIndexTokens = useMemo(() => {
    if (!x10000Markets.length) return [];

    const tokens: TokenData[] = [];
    for (const apiMarket of x10000Markets) {
      const baseAsset = apiMarket.base_asset.toUpperCase();
      const lastPrice = apiMarket.lastPrice || apiMarket.last_price || "0";
      const priceFloat = parseFloat(lastPrice) || 0;
      const priceBigInt = priceFloat > 0
        ? BigInt(Math.floor(priceFloat * 1e18)) * BigInt(10 ** (USD_DECIMALS - 18))
        : 0n;

      // Create a synthetic token address based on base asset
      // Use a deterministic address format: x10000-{BASE_ASSET}
      const syntheticAddress = `x10000-${baseAsset}`.toLowerCase();

      // Create TokenData from API data
      const tokenData: TokenData = {
        address: syntheticAddress,
        symbol: baseAsset,
        name: baseAsset,
        decimals: 18, // Default to 18 decimals for synthetic tokens
        isSynthetic: true,
        prices: {
          minPrice: priceBigInt,
          maxPrice: priceBigInt,
        },
        balance: 0n,
        totalSupply: 0n,
      } as TokenData;

      tokens.push(tokenData);
    }

    return tokens;
  }, [x10000Markets]);

  // Create markets directly from API - no local config dependency
  // All markets are created from API data
  const availableMarketsForX10000 = useMemo(() => {
    // If x10000Markets is empty, return empty array
    if (!x10000Markets.length) return EMPTY_ARRAY;

    // Get USDT token for collateral (longToken and shortToken)
    let usdtToken: TokenData | undefined;
    try {
      const usdtTokenConfig = getTokenBySymbol(chainId, "USDT");
      if (usdtTokenConfig && tokensData) {
        usdtToken = tokensData[usdtTokenConfig.address] || tokensData[usdtTokenConfig.address.toLowerCase()] || {
          ...usdtTokenConfig,
          prices: { minPrice: 0n, maxPrice: 0n },
          balance: 0n,
          totalSupply: 0n,
        } as TokenData;
      }
    } catch (e) {
      // USDT not found, return empty array
      // console.warn("[TradeBoxx10000] USDT token not found, cannot create markets:", e);
      return EMPTY_ARRAY;
    }

    if (!usdtToken) return EMPTY_ARRAY;

    // Create MarketInfo for each API market
    const markets: MarketInfo[] = [];
    for (const apiMarket of x10000Markets) {
      const baseAsset = apiMarket.base_asset.toUpperCase();

      // Find corresponding indexToken from apiIndexTokens
      const indexToken = apiIndexTokens.find(
        (token) => token.symbol.toUpperCase() === baseAsset
      );

      if (!indexToken) {
        // console.warn(`[TradeBoxx10000] Index token not found for base asset: ${baseAsset}`);
        continue;
      }

      // Create a synthetic marketTokenAddress based on base asset
      const syntheticMarketTokenAddress = `x10000-${baseAsset}-USD`;

      // Create MarketInfo with required fields
      const market: MarketInfo = {
        // Market basic info
        marketTokenAddress: syntheticMarketTokenAddress,
        indexTokenAddress: indexToken.address,
        longTokenAddress: usdtToken.address,
        shortTokenAddress: usdtToken.address,

        // Token references
        indexToken,
        longToken: usdtToken,
        shortToken: usdtToken,

        // Market state
        isDisabled: false,

        // Pool amounts (minimal values)
        longPoolAmount: 0n,
        shortPoolAmount: 0n,
        maxLongPoolAmount: 0n,
        maxShortPoolAmount: 0n,
        maxLongPoolUsdForDeposit: 0n,
        maxShortPoolUsdForDeposit: 0n,

        // Pool values
        poolValueMax: 0n,
        poolValueMin: 0n,

        // Reserve factors
        reserveFactorLong: 0n,
        reserveFactorShort: 0n,
        openInterestReserveFactorLong: 0n,
        openInterestReserveFactorShort: 0n,

        // Open interest
        maxOpenInterestLong: 0n,
        maxOpenInterestShort: 0n,

        // Borrowing factors
        borrowingFactorLong: 0n,
        borrowingFactorShort: 0n,
        borrowingExponentFactorLong: 0n,
        borrowingExponentFactorShort: 0n,

        // Funding factors
        fundingFactor: 0n,
        fundingExponentFactor: 0n,
        fundingIncreaseFactorPerSecond: 0n,
        fundingDecreaseFactorPerSecond: 0n,
        thresholdForStableFunding: 0n,
        thresholdForDecreaseFunding: 0n,
        minFundingFactorPerSecond: 0n,
        maxFundingFactorPerSecond: 0n,

        // Other required fields
        totalBorrowingFees: 0n,
        positionImpactPoolAmount: 0n,
        minPositionImpactPoolAmount: 0n,
        positionImpactPoolDistributionRate: 0n,
        minCollateralFactor: 0n,
        minCollateralFactorForLiquidation: 0n,
        minCollateralFactorForOpenInterestLong: 0n,
        minCollateralFactorForOpenInterestShort: 0n,
        swapImpactPoolAmountLong: 0n,
        swapImpactPoolAmountShort: 0n,
        maxPnlFactorForTradersLong: 0n,
        maxPnlFactorForTradersShort: 0n,
        longInterestUsd: 0n,
        shortInterestUsd: 0n,
        longInterestInTokens: 0n,
        shortInterestInTokens: 0n,
        positionFeeFactorForBalanceWasImproved: 0n,
        positionFeeFactorForBalanceWasNotImproved: 0n,
        positionImpactFactorPositive: 0n,
        positionImpactFactorNegative: 0n,
        maxPositionImpactFactorPositive: 0n,
        maxPositionImpactFactorNegative: 0n,
      } as MarketInfo;

      markets.push(market);
    }

    return markets;
  }, [x10000Markets, apiIndexTokens, chainId, tokensData]);
  const { account, active } = useWallet();

  const walletIconUrls = useWalletIconUrls();

  const { shouldDisableValidationForTesting: shouldDisableValidation } = useSettings();

  const onDepositTokenAddress = useOpenMultichainDepositModal();

  const nativeToken = getByKey(tokensData, NATIVE_TOKEN_ADDRESS);

  const [_, setExternalIsCurtainOpen] = useIsCurtainOpenx10000();

  const {
    fromTokenInputValue,
    setFromTokenInputValue: setFromTokenInputValueRaw,
    toTokenInputValue,
    setToTokenInputValue: setToTokenInputValueRaw,
    setCollateralAddress: onSelectCollateralAddress,
    setFromTokenAddress: onSelectFromTokenAddress,
    isFromTokenGmxAccount,
    setIsFromTokenGmxAccount,
    setTradeMode: onSelectTradeMode,
    focusedInput,
    setFocusedInput,
    closeSizeInputValue,
    setCloseSizeInputValue,
    triggerPriceInputValue,
    setTriggerPriceInputValue,
    triggerRatioInputValue,
    setTriggerRatioInputValue,
    takeProfitPriceInputValue,
    setTakeProfitPriceInputValue,
    stopLossPriceInputValue,
    setStopLossPriceInputValue,
    leverageInputValue,
    setLeverageInputValue,
    leverageOption,
    setLeverageOption,
    isSwitchTokensAllowed,
    switchTokenAddresses,
    tradeMode,
    tradeType,
    collateralToken,
    fromTokenAddress,
    marketInfo,
    toTokenAddress,
    availableTradeModes,
    duration,
    numberOfParts,
    setNumberOfParts,
    setDuration,
    limitPriceWarningHidden,
    setLimitPriceWarningHidden,
    setToTokenAddress: setToTokenAddress,
  } = useSelector(selectTradeboxState);

  const isTwapModeAvailable = useMemo(
    () =>
      availableTradeModes.some((mode) =>
        Array.isArray(mode) ? mode.some((nestedMode) => nestedMode === TradeMode.Twap) : mode === TradeMode.Twap
      ),
    [availableTradeModes]
  );

  // Track previous values to prevent unnecessary updates
  // Initialize with undefined to ensure first render triggers the effect
  const prevSelectedSymbolRef = useRef<string | null | undefined>(undefined);
  const prevToTokenAddressRef = useRef<string | undefined>(undefined);
  const isInitializedRef = useRef<boolean>(false);

  // Initialize: On mount, if selectedSymbol exists, prioritize it over localStorage saved toTokenAddress
  // This ensures that on page refresh, the UI shows the correct token based on selectedSymbol
  useEffect(() => {
    // Only run once on mount
    if (isInitializedRef.current) return;

    // Wait for essential data to be available
    if (!selectedSymbol || !chainId || !availableMarketsForX10000 || availableMarketsForX10000.length === 0) {
      return;
    }

    // Find the market matching selectedSymbol
    // Try to extract baseAsset from x10000SelectedMarket or from selectedSymbol directly
    let baseAsset = x10000SelectedMarket?.base_asset?.toUpperCase();
    if (!baseAsset) {
      // Fallback: extract from selectedSymbol (e.g., "BTCUSDT" -> "BTC")
      baseAsset = selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
    }
    if (!baseAsset) return;

    // Mark as initialized only AFTER we confirmed we can proceed
    isInitializedRef.current = true;

    // Directly use base_asset from API - no hardcoded mappings
    // Find token by matching base_asset symbol in apiIndexTokens or availableMarketsForX10000
    let targetTokenAddress: string | undefined;

    // Method 1: Try to find in apiIndexTokens (all tokens from API)
    if (apiIndexTokens && apiIndexTokens.length > 0) {
      const matchingToken = apiIndexTokens.find((token) => {
        const tokenSymbolUpper = token.symbol.toUpperCase();
        return tokenSymbolUpper === baseAsset;
      });
      if (matchingToken) {
        targetTokenAddress = matchingToken.address;
      }
    }

    // Method 2: If still not found, try to find in availableMarketsForX10000
    if (!targetTokenAddress && availableMarketsForX10000 && availableMarketsForX10000.length > 0) {
      const matchingMarket = availableMarketsForX10000.find((market) => {
        const indexToken = market.indexToken;
        if (!indexToken) return false;
        const tokenSymbolUpper = indexToken.symbol.toUpperCase();
        return tokenSymbolUpper === baseAsset;
      });

      if (matchingMarket) {
        targetTokenAddress = matchingMarket.indexTokenAddress;
      }
    }

    // If we found a matching token and it's different from current toTokenAddress, update it
    if (targetTokenAddress && targetTokenAddress !== toTokenAddress) {
      console.log(`[TradeBoxx10000] Initializing: Setting toTokenAddress to ${targetTokenAddress} based on selectedSymbol ${selectedSymbol}. Current: ${toTokenAddress}`);
      setToTokenAddress(targetTokenAddress);
    } else if (!targetTokenAddress) {
      console.warn(`[TradeBoxx10000] Initialization: Could not find token for baseAsset ${baseAsset}`);
    }
  }, [selectedSymbol, x10000SelectedMarket, apiIndexTokens, availableMarketsForX10000, toTokenAddress, setToTokenAddress, chainId, tokensData]);

  // Sync selectedSymbol from X10000StateContext to tradeboxx10000.toTokenAddress
  useEffect(() => {
    const symbolChanged = selectedSymbol !== prevSelectedSymbolRef.current;

    // Update ref if symbol changed
    if (symbolChanged) {
      prevSelectedSymbolRef.current = selectedSymbol;
    }

    // Wait for essential data to be available
    // Don't require x10000SelectedMarket if we have apiIndexTokens or availableMarketsForX10000
    if (!selectedSymbol || !chainId) {
      return;
    }

    // console.log(`[TradeBoxx10000] Forward sync triggered: selectedSymbol=${selectedSymbol}, apiIndexTokens.length=${apiIndexTokens?.length || 0}, availableMarketsForX10000.length=${availableMarketsForX10000?.length || 0}, x10000SelectedMarket=${x10000SelectedMarket ? 'exists' : 'null'}`);

    // If we have x10000SelectedMarket, use its base_asset
    // Otherwise, try to extract base_asset from selectedSymbol or find in availableMarketsForX10000
    let baseAsset: string | undefined;

    if (x10000SelectedMarket) {
      baseAsset = x10000SelectedMarket.base_asset.toUpperCase();
      // console.log(`[TradeBoxx10000] Using base_asset from x10000SelectedMarket: ${baseAsset}`);
    } else if (availableMarketsForX10000 && availableMarketsForX10000.length > 0) {
      // Try to find market by symbol first
      // Extract base asset from selectedSymbol (e.g., "SOL-USD" -> "SOL")
      const symbolBaseAsset = selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
      // console.log(`[TradeBoxx10000] Extracted baseAsset from selectedSymbol: ${symbolBaseAsset}`);

      const marketBySymbol = availableMarketsForX10000.find((market) => {
        // Try to match by indexToken symbol
        return market.indexToken?.symbol.toUpperCase() === symbolBaseAsset;
      });

      if (marketBySymbol?.indexToken) {
        baseAsset = marketBySymbol.indexToken.symbol.toUpperCase();
        // console.log(`[TradeBoxx10000] Found market by symbol, baseAsset: ${baseAsset}`);
      } else {
        // If not found, use the extracted base asset
        baseAsset = symbolBaseAsset;
        // console.log(`[TradeBoxx10000] Market not found by symbol, using extracted baseAsset: ${baseAsset}`);
      }
    } else {
      // If still no baseAsset, try to extract from selectedSymbol (e.g., "SOL-USD" -> "SOL")
      baseAsset = selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
      // console.log(`[TradeBoxx10000] No markets available, extracted baseAsset from selectedSymbol: ${baseAsset}`);
    }

    if (!baseAsset) {
      // console.warn(`[TradeBoxx10000] Could not determine baseAsset from selectedSymbol ${selectedSymbol}`);
      return;
    }

    // Directly find token by matching base_asset symbol in apiIndexTokens or availableMarketsForX10000
    let targetTokenAddress: string | undefined;

    // Method 1: Try to find in apiIndexTokens (all tokens from API)
    if (apiIndexTokens && apiIndexTokens.length > 0) {
      // console.log(`[TradeBoxx10000] Searching in apiIndexTokens (${apiIndexTokens.length} tokens) for baseAsset: ${baseAsset}`);
      const matchingToken = apiIndexTokens.find((token) => {
        const tokenSymbolUpper = token.symbol.toUpperCase();
        return tokenSymbolUpper === baseAsset;
      });
      if (matchingToken) {
        targetTokenAddress = matchingToken.address;
        // console.log(`[TradeBoxx10000] Found token in apiIndexTokens: ${targetTokenAddress} (${matchingToken.symbol})`);
      } else {
        // console.log(`[TradeBoxx10000] Token not found in apiIndexTokens. Available symbols: ${apiIndexTokens.map(t => t.symbol).join(', ')}`);
      }
    }

    // Method 2: If still not found, try to find in availableMarketsForX10000
    if (!targetTokenAddress && availableMarketsForX10000 && availableMarketsForX10000.length > 0) {
      // console.log(`[TradeBoxx10000] Searching in availableMarketsForX10000 (${availableMarketsForX10000.length} markets) for baseAsset: ${baseAsset}`);
      const matchingMarket = availableMarketsForX10000.find((market) => {
        const indexToken = market.indexToken;
        if (!indexToken) return false;
        const tokenSymbolUpper = indexToken.symbol.toUpperCase();
        return tokenSymbolUpper === baseAsset;
      });

      if (matchingMarket) {
        targetTokenAddress = matchingMarket.indexTokenAddress;
        // console.log(`[TradeBoxx10000] Found market in availableMarketsForX10000: ${targetTokenAddress} (${matchingMarket.indexToken.symbol})`);
      } else {
        // console.log(`[TradeBoxx10000] Market not found in availableMarketsForX10000. Available symbols: ${availableMarketsForX10000.map(m => m.indexToken?.symbol).filter(Boolean).join(', ')}`);
      }
    }

    // Update toTokenAddress if found and different
    // Also check if current toTokenAddress matches the expected token for selectedSymbol
    if (targetTokenAddress) {
      // Check if current toTokenAddress matches what selectedSymbol expects
      const currentToToken = toTokenAddress ? (apiIndexTokens.find(t => t.address === toTokenAddress) ||
        availableMarketsForX10000.find(m => m.indexTokenAddress === toTokenAddress)?.indexToken) : null;
      const currentToTokenSymbol = currentToToken?.symbol.toUpperCase();

      if (targetTokenAddress !== toTokenAddress) {
        console.log(`[TradeBoxx10000] ✅ Syncing: Setting toTokenAddress to ${targetTokenAddress} (${baseAsset}) based on selectedSymbol ${selectedSymbol}. Current toTokenAddress: ${toTokenAddress} (${currentToTokenSymbol || 'unknown'})`);
        setToTokenAddress(targetTokenAddress);
      } else if (currentToTokenSymbol !== baseAsset) {
        // Current toTokenAddress doesn't match selectedSymbol, force update
        console.log(`[TradeBoxx10000] ⚠️  Force syncing: Current toTokenAddress ${toTokenAddress} (${currentToTokenSymbol}) doesn't match selectedSymbol ${selectedSymbol} (${baseAsset}), updating to ${targetTokenAddress}`);
        setToTokenAddress(targetTokenAddress);
      } else {
        // console.log(`[TradeBoxx10000] ⏭️  Skipping sync: toTokenAddress already set to ${targetTokenAddress} (${baseAsset})`);
      }
    } else {
      console.warn(`[TradeBoxx10000] ❌ Could not find token for baseAsset ${baseAsset} from selectedSymbol ${selectedSymbol}. apiIndexTokens:`, apiIndexTokens?.map(t => t.symbol), `availableMarkets:`, availableMarketsForX10000?.map(m => m.indexToken?.symbol));
    }
  }, [selectedSymbol, x10000SelectedMarket, apiIndexTokens, availableMarketsForX10000, toTokenAddress, setToTokenAddress, chainId, tokensData]);

  // Sync toTokenAddress from tradeboxx10000 to X10000StateContext.selectedSymbol
  // Only sync if the current toTokenAddress doesn't match the selectedSymbol
  // This prevents reverse sync from overriding forward sync (selectedSymbol -> toTokenAddress)
  useEffect(() => {
    // Skip if toTokenAddress didn't actually change
    if (toTokenAddress === prevToTokenAddressRef.current) return;
    prevToTokenAddressRef.current = toTokenAddress;

    if (!toTokenAddress || !availableMarketsForX10000 || !x10000Markets.length) return;

    // Find MarketInfo for current toTokenAddress
    const currentMarket = availableMarketsForX10000.find((market) => market.indexTokenAddress === toTokenAddress);
    if (!currentMarket) return;

    const indexToken = currentMarket.indexToken;
    if (!indexToken) return;

    // Use token symbol directly - no hardcoded mappings
    // Find matching X10000Market by base_asset matching token symbol
    const tokenSymbolUpper = indexToken.symbol.toUpperCase();
    const matchingX10000Market = x10000Markets.find(
      (market) => market.base_asset.toUpperCase() === tokenSymbolUpper
    );

    if (!matchingX10000Market) return;

    // Check if the current toTokenAddress matches what selectedSymbol expects
    // If selectedSymbol expects a different token, forward sync is in progress, skip reverse sync
    if (selectedSymbol) {
      const selectedBaseAsset = x10000SelectedMarket?.base_asset?.toUpperCase() ||
        selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();

      // If selectedSymbol expects a different token than what toTokenAddress represents,
      // forward sync is in progress, don't override it
      if (tokenSymbolUpper !== selectedBaseAsset) {
        // console.log(`[TradeBoxx10000] Reverse sync skipped: selectedSymbol expects ${selectedBaseAsset}, but toTokenAddress is ${tokenSymbolUpper}`);
        return;
      }
    }

    // Only sync if the symbol doesn't match (to avoid unnecessary updates)
    if (matchingX10000Market.symbol !== selectedSymbol) {
      // console.log(`[TradeBoxx10000] Reverse sync: Setting selectedSymbol to ${matchingX10000Market.symbol} based on toTokenAddress ${toTokenAddress}`);
      setSelectedSymbol(matchingX10000Market.symbol);
    }
  }, [toTokenAddress, availableMarketsForX10000, x10000Markets, selectedSymbol, setSelectedSymbol, tokensData, x10000SelectedMarket]);

  const fromToken = useSelector(selectTradeboxFromToken);
  // Get toToken from availableMarketsForX10000 (API data) first, fallback to tokensData
  const toToken = useMemo(() => {
    if (!toTokenAddress) return undefined;
    // First try to find in availableMarketsForX10000 (API markets)
    const market = availableMarketsForX10000.find((m) => m.indexTokenAddress === toTokenAddress);
    if (market?.indexToken) return market.indexToken;
    // Fallback to tokensData
    return getByKey(tokensData, toTokenAddress);
  }, [toTokenAddress, availableMarketsForX10000, tokensData]);
  const fromTokenAmount = fromToken ? parseValue(fromTokenInputValue || "0", fromToken.decimals)! : 0n;
  const fromTokenPrice = fromToken?.prices.minPrice;
  const fromUsd = convertToUsd(fromTokenAmount, fromToken?.decimals, fromTokenPrice);

  const closeSizeUsd = parseValue(closeSizeInputValue || "0", USD_DECIMALS)!;

  const markPrice = useSelector(selectTradeboxMarkPrice);

  // In x10000 mode, markPrice may be undefined. Fall back to x10000SelectedMarket.lastPrice
  const effectiveMarkPrice = useMemo(() => {
    if (markPrice !== undefined) {
      return markPrice;
    }
    // Fall back to x10000 market lastPrice
    const lastPriceStr = x10000SelectedMarket?.lastPrice || x10000SelectedMarket?.ticker?.lastPrice;
    if (lastPriceStr) {
      const priceFloat = parseFloat(lastPriceStr);
      if (priceFloat > 0) {
        // Convert to BigInt with USD_DECIMALS (30 decimals)
        return BigInt(Math.floor(priceFloat * 1e18)) * BigInt(10 ** (USD_DECIMALS - 18));
      }
    }
    return undefined;
  }, [markPrice, x10000SelectedMarket]);

  const swapAmounts = useSelector(selectTradeboxSwapAmounts);
  const increaseAmounts = useSelector(selectTradeboxIncreasePositionAmounts);
  const decreaseAmounts = useSelector(selectTradeboxDecreasePositionAmounts);
  const selectedPositionKey = useSelector(selectTradeboxSelectedPositionKey);
  const selectedPosition = useSelector(selectTradeboxSelectedPosition);
  const positionsInfoData = useSelector(selectPositionsInfoData);
  const leverage = useSelector(selectTradeboxLeverage);
  const nextPositionValues = useSelector(selectTradeboxNextPositionValues);
  const fees = useSelector(selectTradeboxFees);
  const expressOrdersEnabled = useSelector(selectExpressOrdersEnabled);
  const setExpressOrdersEnabled = useSelector(selectSetExpressOrdersEnabled);
  const gasPaymentTokenData = useSelector(selectGasPaymentToken);
  const gasPaymentTokenAddress = useSelector(selectGasPaymentTokenAddress);
  const { subaccount } = useSelector(selectSubaccountState);
  const { shouldShowDepositButton } = useGmxAccountShowDepositButton();
  const { setIsSettingsVisible, isLeverageSliderEnabled } = useSettings();

  const executionFee = useSelector(selectTradeboxExecutionFee);
  const { markRatio } = useSelector(selectTradeboxTradeRatios);

  const leverageSliderMarks = useSelector(selectTradeboxLeverageSliderMarks);
  const maxLeverage = useSelector(selectTradeboxMaxLeverage);

  const maxAllowedLeverage = maxLeverage / 2;

  const decreaseOrdersThatWillBeExecuted = useDecreaseOrdersThatWillBeExecutedx10000();

  const priceImpactWarningState = usePriceImpactWarningState({
    collateralNetPriceImpact: fees?.collateralNetPriceImpact,
    swapPriceImpact: fees?.swapPriceImpact,
    swapProfitFee: fees?.swapProfitFee,
    executionFeeUsd: executionFee?.feeUsd,
    willDecreaseOrdersBeExecuted: decreaseOrdersThatWillBeExecuted.length > 0,
    externalSwapFeeItem: fees?.externalSwapFee,
    tradeFlags,
    payUsd: fromUsd,
  });

  const twapRecommendation = getTwapRecommendation(
    isIncrease
      ? {
          enabled: isPosition && !isSwap && !isTwap && isTwapModeAvailable,
          sizeDeltaUsd: increaseAmounts?.sizeDeltaUsd,
          priceImpactPrecise: fees?.increasePositionPriceImpact?.precisePercentage,
        }
      : {
          enabled: isPosition && isTrigger && !isTwap && isTwapModeAvailable,
          sizeDeltaUsd: decreaseAmounts?.sizeDeltaUsd,
          priceImpactPrecise: fees?.decreasePositionPriceImpact?.precisePercentage,
        }
  );

  const { showHighLeverageWarning, dismissHighLeverageWarning } = useShowHighLeverageWarningx10000();

  const setIsDismissedRef = useLatest(priceImpactWarningState.setIsDismissed);

  const setFromTokenInputValue = useCallback(
    (value: string, resetPriceImpactAndSwapSlippage?: boolean) => {
      setFromTokenInputValueRaw(value);

      if (resetPriceImpactAndSwapSlippage) {
        setIsDismissedRef.current(false);

        setDefaultAllowedSwapSlippageBps(undefined);
        setSelectedAllowedSwapSlippageBps(undefined);
      }
    },
    [setFromTokenInputValueRaw, setIsDismissedRef, setDefaultAllowedSwapSlippageBps, setSelectedAllowedSwapSlippageBps]
  );

  const setToTokenInputValue = useCallback(
    (value: string, shouldResetPriceImpactAndSwapSlippage: boolean) => {
      setToTokenInputValueRaw(value);
      if (shouldResetPriceImpactAndSwapSlippage) {
        setIsDismissedRef.current(false);

        setDefaultAllowedSwapSlippageBps(undefined);
        setSelectedAllowedSwapSlippageBps(undefined);
      }
    },
    [setIsDismissedRef, setToTokenInputValueRaw, setDefaultAllowedSwapSlippageBps, setSelectedAllowedSwapSlippageBps]
  );

  const { warning: maxAutoCancelOrdersWarning } = useMaxAutoCancelOrdersState({
    positionKey: selectedPositionKey,
    isCreatingNewAutoCancel: isTrigger,
  });

  const submitButtonState = useTradeboxButtonStatex10000({
    account,
    setToTokenInputValue,
  });

  const wrappedOnSubmit = useCallback(async () => {
    await submitButtonState.onSubmit();
    if (isMobile) {
      setExternalIsCurtainOpen(false);
    }
  }, [submitButtonState, isMobile, setExternalIsCurtainOpen]);

  const { gasPaymentTokenAmountForMax, isGasPaymentTokenAmountForMaxApproximate } = useMemo(() => {
    if (!expressOrdersEnabled) {
      return {};
    }
    if (
      submitButtonState.expressParams?.gasPaymentParams.gasPaymentTokenAmount !== undefined &&
      // Submit button state may store previous gas payment token address, so we need to check if it matches the current gas payment token address
      submitButtonState.expressParams.gasPaymentParams.gasPaymentTokenAddress === gasPaymentTokenAddress
    ) {
      return {
        gasPaymentTokenAmountForMax: submitButtonState.expressParams.gasPaymentParams.gasPaymentTokenAmount,
        isGasPaymentTokenAmountForMaxApproximate: false,
      };
    }
    if (executionFee && gasPaymentTokenData) {
      const gasPaymentTokenAmountForMax = convertToTokenAmount(
        executionFee.feeUsd,
        gasPaymentTokenData.decimals,
        gasPaymentTokenData.prices.maxPrice
      )!;
      return {
        gasPaymentTokenAmountForMax,
        isGasPaymentTokenAmountForMaxApproximate: true,
      };
    }
    const gasPaymentToken = getToken(chainId, gasPaymentTokenAddress);
    if (isUsdBasedStableToken(gasPaymentToken)) {
      const gasPaymentTokenAmountForMax = expandDecimals(
        EXPRESS_DEFAULT_MIN_RESIDUAL_USD_NUMBER,
        gasPaymentToken.decimals
      );
      return {
        gasPaymentTokenAmountForMax,
        isGasPaymentTokenAmountForMaxApproximate: true,
      };
    }
    return {};
  }, [
    expressOrdersEnabled,
    submitButtonState.expressParams?.gasPaymentParams.gasPaymentTokenAmount,
    submitButtonState.expressParams?.gasPaymentParams.gasPaymentTokenAddress,
    gasPaymentTokenAddress,
    executionFee,
    gasPaymentTokenData,
    chainId,
  ]);

  const { formattedMaxAvailableAmount, showClickMax } = useMaxAvailableAmount({
    fromToken,
    nativeToken,
    fromTokenAmount,
    fromTokenInputValue,
    minResidualAmount: getMinResidualGasPaymentTokenAmount({
      gasPaymentToken: gasPaymentTokenData,
      gasPaymentTokenAmount: gasPaymentTokenAmountForMax,
      payTokenAddress: fromTokenAddress,
      applyBuffer: !isGasPaymentTokenAmountForMaxApproximate,
    }),
    isLoading:
      expressOrdersEnabled && (submitButtonState.isExpressLoading || gasPaymentTokenAmountForMax === undefined),
  });

  const onMaxClick = useCallback(() => {
    if (formattedMaxAvailableAmount) {
      setFocusedInput("from");
      setFromTokenInputValue(formattedMaxAvailableAmount, true);
    }
  }, [formattedMaxAvailableAmount, setFocusedInput, setFromTokenInputValue]);

  useTradeboxAcceptablePriceImpactValuesx10000();
  useTradeboxTPSLResetx10000(priceImpactWarningState.setIsDismissed);

  const prevIsISwap = usePrevious(isSwap);

  useEffect(
    function updateInputAmounts() {
      if (!fromToken || !toToken || (!isSwap && !isIncrease)) {
        return;
      }

      // reset input values when switching between swap and position tabs
      if (prevIsISwap !== undefined && isSwap !== prevIsISwap) {
        setFocusedInput("from");

        setFromTokenInputValue("", true);
        return;
      }

      if (isSwap && swapAmounts) {
        if (focusedInput === "from") {
          setToTokenInputValue(
            swapAmounts.amountOut > 0 ? formatAmountFree(swapAmounts.amountOut, toToken.decimals) : "",
            false
          );
        } else {
          setFromTokenInputValue(
            swapAmounts.amountIn > 0 ? formatAmountFree(swapAmounts.amountIn, fromToken.decimals) : "",
            false
          );
        }
      }

      if (isIncrease && increaseAmounts) {
        // For positions, always show the indexToken amount in the "to" input
        // This works for both Long and Short - the toToken is always the indexToken (ETH, SOL, etc.)
        const visualMultiplier = BigInt(toToken.visualMultiplier ?? 1);
        if (focusedInput === "from") {
          // User is entering collateral amount, update indexToken amount
          setToTokenInputValue(
            increaseAmounts.indexTokenAmount > 0
              ? formatAmountFree(increaseAmounts.indexTokenAmount / visualMultiplier, toToken.decimals)
              : "",
            false
          );
        } else {
          // User is entering indexToken amount, update collateral amount
          setFromTokenInputValue(
            increaseAmounts.initialCollateralAmount > 0
              ? formatAmountFree(increaseAmounts.initialCollateralAmount, fromToken.decimals)
              : "",
            false
          );
        }
      }
    },
    [
      focusedInput,
      fromToken,
      increaseAmounts,
      isIncrease,
      isSwap,
      prevIsISwap,
      setFocusedInput,
      setFromTokenInputValue,
      setToTokenInputValue,
      swapAmounts,
      toToken,
    ]
  );

  useEffect(
    function resetTriggerPrice() {
      setTriggerPriceInputValue("");
    },
    [setTriggerPriceInputValue, toTokenAddress, tradeMode]
  );

  useEffect(
    function validateLeverageOption() {
      // 如果还没有拿到有效的最大杠杆，不要把当前值错误地重置成 0
      if (!maxAllowedLeverage) {
        return;
      }

      const maxAllowed = maxAllowedLeverage / BASIS_POINTS_DIVISOR;

      if (leverageOption && leverageOption > maxAllowed) {
        setLeverageOption(maxAllowed);
      }
    },
    [leverageOption, maxAllowedLeverage, setLeverageOption]
  );

  useEffect(
    function tradeBoxInteractionStartedEffect() {
      if (fromTokenInputValue.length > 0) {
        let pair = "";

        if (isSwap) {
          pair = `${fromToken?.symbol}/${toToken?.symbol}`;
        } else if (marketInfo) {
          pair = marketInfo.name;
        }

        let sizeDeltaUsd: bigint | undefined = undefined;
        let amountUsd: bigint | undefined = undefined;
        let priceImpactDeltaUsd = 0n;
        let priceImpactPercentage = 0n;

        if (isIncrease && increaseAmounts) {
          sizeDeltaUsd = increaseAmounts.sizeDeltaUsd;
          priceImpactDeltaUsd = increaseAmounts.positionPriceImpactDeltaUsd;
          priceImpactPercentage = fees?.increasePositionPriceImpact?.precisePercentage ?? 0n;
        } else if (isSwap && swapAmounts) {
          amountUsd = swapAmounts.usdOut;
          priceImpactDeltaUsd = swapAmounts.swapStrategy.swapPathStats?.totalSwapPriceImpactDeltaUsd ?? 0n;
          priceImpactPercentage = fees?.swapPriceImpact?.precisePercentage ?? 0n;
        } else if (isTrigger && decreaseAmounts) {
          sizeDeltaUsd = decreaseAmounts.sizeDeltaUsd;
          priceImpactDeltaUsd = decreaseAmounts.totalPendingImpactDeltaUsd;
          priceImpactPercentage = fees?.totalPendingImpact?.precisePercentage ?? 0n;
        }

        const openInterestPercent = isLong
          ? chartHeaderInfo?.longOpenInterestPercentage
          : chartHeaderInfo?.shortOpenInterestPercentage;
        const fundingRate1h = isLong ? chartHeaderInfo?.fundingRateLong : chartHeaderInfo?.fundingRateShort;

        if (!pair) {
          return;
        }

        sendTradeBoxInteractionStartedEvent({
          pair,
          sizeDeltaUsd,
          priceImpactDeltaUsd,
          priceImpactPercentage,
          fundingRate1h,
          isExpress: expressOrdersEnabled,
          isExpress1CT: Boolean(subaccount),
          openInterestPercent,
          tradeType,
          tradeMode,
          amountUsd,
        });
      }
    },
    [
      chartHeaderInfo?.fundingRateLong,
      chartHeaderInfo?.fundingRateShort,
      chartHeaderInfo?.longOpenInterestPercentage,
      chartHeaderInfo?.shortOpenInterestPercentage,
      decreaseAmounts,
      expressOrdersEnabled,
      fees?.increasePositionPriceImpact?.precisePercentage,
      fees?.totalPendingImpact?.precisePercentage,
      fees?.swapPriceImpact?.precisePercentage,
      fromToken?.symbol,
      fromTokenInputValue.length,
      increaseAmounts,
      isIncrease,
      isLong,
      isSwap,
      isTrigger,
      marketInfo,
      subaccount,
      swapAmounts,
      toToken?.symbol,
      tradeMode,
      tradeType,
    ]
  );

  useEffect(
    function gasPaymentTokenChangedEffect() {
      const handleGasPaymentTokenChanged = () => {
        setFromTokenInputValue("", true);
      };
      window.addEventListener("gasPaymentTokenChanged", handleGasPaymentTokenChanged);

      return () => {
        window.removeEventListener("gasPaymentTokenChanged", handleGasPaymentTokenChanged);
      };
    },
    [setFromTokenInputValue]
  );

  const onSwitchTokens = useCallback(() => {
    setFocusedInput((old) => (old === "from" ? "to" : "from"));
    switchTokenAddresses();
    setFromTokenInputValue(toTokenInputValue || "", true);
    setToTokenInputValue(fromTokenInputValue || "", true);
  }, [
    fromTokenInputValue,
    setFocusedInput,
    setFromTokenInputValue,
    setToTokenInputValue,
    switchTokenAddresses,
    toTokenInputValue,
  ]);

  const onSelectToTokenAddress = useSelector(selectTradeboxChooseSuitableMarket);

  // Debug logging removed for centralized version
  // if (showDebugValues) {
  //   const swapPathStats = swapAmounts?.swapStrategy.swapPathStats || increaseAmounts?.swapStrategy.swapPathStats;
  //
  //   if (swapPathStats) {
  //     // eslint-disable-next-line no-console
  //     throttleLog("Swap Path", {
  //       steps: swapPathStats.swapSteps,
  //       path: swapPathStats.swapPath.map((marketAddress) => marketsInfoData?.[marketAddress]?.name).join(" -> "),
  //       priceImpact: swapPathStats.swapSteps.map((step) => formatDeltaUsd(step.priceImpactDeltaUsd)).join(" -> "),
  //       usdOut: swapPathStats.swapSteps.map((step) => formatUsd(step.usdOut)).join(" -> "),
  //     });
  //   }
  // }

  const handleFromInputTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFocusedInput("from");
      setFromTokenInputValue(event.target.value, true);
    },
    [setFocusedInput, setFromTokenInputValue]
  );
  const handleToInputTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFocusedInput("to");
      setToTokenInputValue(event.target.value, true);
    },
    [setFocusedInput, setToTokenInputValue]
  );
  const isNonEoaAccountOnAnyChain = useIsNonEoaAccountOnAnyChain();
  const handleSelectFromTokenAddress = useCallback(
    (tokenAddress: string, isGmxAccount: boolean) => {
      if (isGmxAccount && isNonEoaAccountOnAnyChain) {
        helperToast.error(t` Smart wallets are not supported on Express or One-Click Trading.`);
        return;
      }

      if (isGmxAccount && !expressOrdersEnabled) {
        setExpressOrdersEnabled(true);

        toastEnableExpress(() => setIsSettingsVisible(true));
      }

      onSelectFromTokenAddress(tokenAddress);
      setIsFromTokenGmxAccount(isGmxAccount);
    },
    [
      expressOrdersEnabled,
      isNonEoaAccountOnAnyChain,
      onSelectFromTokenAddress,
      setExpressOrdersEnabled,
      setIsFromTokenGmxAccount,
      setIsSettingsVisible,
    ]
  );
  const handleSelectToTokenAddress = useCallback(
    (token: Token) => onSelectToTokenAddress(token.address),
    [onSelectToTokenAddress]
  );
  const handleCloseInputChange = useCallback((e) => setCloseSizeInputValue(e.target.value), [setCloseSizeInputValue]);

  // In x10000 TP/SL mode, selectedPosition may be undefined due to position key mismatch.
  // Fall back to searching positionsInfoData by market symbol and direction.
  const effectiveSelectedPosition = useMemo(() => {
    if (selectedPosition) {
      return selectedPosition;
    }
    // Only search when in TP/SL mode and we have positions data
    if (!isTrigger || !positionsInfoData || !selectedSymbol) {
      return undefined;
    }
    // Extract base asset from selectedSymbol (e.g., "BTC-USD" -> "BTC")
    const baseAsset = selectedSymbol.replace(/[-/]?USD[T]?$/i, "").toUpperCase();
    if (!baseAsset) {
      return undefined;
    }
    // Search positions for matching market and direction
    const positions = Object.values(positionsInfoData);
    const matchedPosition = positions.find((pos) => {
      const marketSymbol = pos.marketInfo?.indexToken?.symbol?.toUpperCase();
      return marketSymbol === baseAsset && pos.isLong === isLong;
    });
    return matchedPosition;
  }, [selectedPosition, isTrigger, positionsInfoData, selectedSymbol, isLong]);

  const formattedMaxCloseSize = formatAmount(effectiveSelectedPosition?.sizeInUsd, USD_DECIMALS, 2);

  const setMaxCloseSize = useCallback(
    () => setCloseSizeInputValue(formattedMaxCloseSize),
    [formattedMaxCloseSize, setCloseSizeInputValue]
  );
  const handleClosePercentageChange = useCallback(
    (percent: number) =>
      setCloseSizeInputValue(
        formatAmount(((effectiveSelectedPosition?.sizeInUsd ?? 0n) * BigInt(percent)) / 100n, USD_DECIMALS, 2)
      ),
    [effectiveSelectedPosition?.sizeInUsd, setCloseSizeInputValue]
  );

  const handleTriggerPriceInputChange = useCallback(
    (e) => setTriggerPriceInputValue(e.target.value),
    [setTriggerPriceInputValue]
  );

  // Handlers for separate TP/SL inputs
  const handleTakeProfitPriceInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setTakeProfitPriceInputValue(e.target.value),
    [setTakeProfitPriceInputValue]
  );

  const handleStopLossPriceInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setStopLossPriceInputValue(e.target.value),
    [setStopLossPriceInputValue]
  );

  const setMarkPriceAsTriggerPrice = useCallback(() => {
    if (effectiveMarkPrice === undefined) {
      return;
    }

    setTriggerPriceInputValue(
      formatAmount(
        effectiveMarkPrice,
        USD_DECIMALS,
        calculateDisplayDecimals(effectiveMarkPrice, undefined, toToken?.visualMultiplier),
        undefined,
        undefined,
        toToken?.visualMultiplier
      )
    );
  }, [effectiveMarkPrice, setTriggerPriceInputValue, toToken?.visualMultiplier]);

  const handleTriggerMarkPriceClick = useCallback(
    () => setTriggerRatioInputValue(formatAmount(markRatio?.ratio, USD_DECIMALS, 10)),
    [markRatio?.ratio, setTriggerRatioInputValue]
  );
  const handleTriggerRatioInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setTriggerRatioInputValue(e.target.value);
    },
    [setTriggerRatioInputValue]
  );

  const handleSelectMarket = useCallback(
    (indexName: string, marketInfo: MarketInfo) => {
      onSelectToTokenAddress(marketInfo.indexToken.address);
      // Sync to X10000StateContext - find matching X10000Market by base_asset
      const indexToken = marketInfo.indexToken;
      if (indexToken?.symbol && x10000Markets.length > 0) {
        const tokenSymbolUpper = indexToken.symbol.toUpperCase();

        // Use token symbol directly - no hardcoded mappings
        // Find matching X10000Market by base_asset matching token symbol
        const matchingX10000Market = x10000Markets.find(
          (market) => market.base_asset.toUpperCase() === tokenSymbolUpper
        );

        if (matchingX10000Market) {
          setSelectedSymbol(matchingX10000Market.symbol);
        }
      }
    },
    [onSelectToTokenAddress, x10000Markets, setSelectedSymbol]
  );

  const handleFormSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!isCursorInside && (!submitButtonState.disabled || shouldDisableValidation)) {
        wrappedOnSubmit();
      }
    },
    [isCursorInside, wrappedOnSubmit, submitButtonState, shouldDisableValidation]
  );

  // TODO: 10000倍杠杆配置 - 在以后迭代版本中启用
  // const LEVERAGE_JUMP_THRESHOLD = 50;
  // const LEVERAGE_JUMP_TARGET = 10000;

  const handleLeverageInputBlur = useCallback(() => {
    const trimmedValue = leverageInputValue?.trim() ?? "";

    if (trimmedValue !== "") {
      const parsed = Number(trimmedValue);

      if (!Number.isNaN(parsed)) {
        const next = Math.max(1, Math.round(parsed));

        if (next !== leverageOption) {
          setLeverageOption(next);
        }

        const nextString = next.toString();

        if (nextString !== leverageInputValue) {
          setLeverageInputValue(nextString);
        }

        return;
      }
    }

    if (leverageOption === 0) {
      setLeverageOption(leverageSliderMarks[0]);
      return;
    }

    if (leverageInputValue === "" && leverageOption !== undefined) {
      setLeverageInputValue(leverageOption.toString());
    }
  }, [
    leverageInputValue,
    leverageOption,
    leverageSliderMarks,
    setLeverageInputValue,
    setLeverageOption,
  ]);

  const handleLeverageInputKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        const direction = e.key === "ArrowUp" ? 1 : -1;
        const newValue = (leverageOption ?? leverageSliderMarks[0]) + direction;
        const clampedValue = Math.min(Math.max(newValue, 1), leverageSliderMarks.at(-1)!);

        setLeverageOption(clampedValue);
      }
    },
    [leverageOption, leverageSliderMarks, setLeverageOption]
  );

  const handleLeverageSliderChange = useCallback(
    (nextValue: number) => {
      const next = Math.max(1, Math.round(nextValue));

      setLeverageOption(next);
      setLeverageInputValue(next.toString());
    },
    [setLeverageOption, setLeverageInputValue]
  );

  const payUsd = isIncrease ? increaseAmounts?.initialCollateralUsd : fromUsd;

  const displayedLeverage = useMemo(() => {
    const base =
      formatLeverage(isLeverageSliderEnabled ? leverage : increaseAmounts?.estimatedLeverage) || "-";

    // TODO: 10000倍杠杆特殊显示逻辑 - 在以后迭代版本中启用
    // x10000 页面特殊显示：当滑块跳到 10000 档位时，文案固定为 10kx
    // if (leverageOption && leverageOption >= 10000) {
    //   return "10kx";
    // }
    return base;
  }, [increaseAmounts?.estimatedLeverage, isLeverageSliderEnabled, leverage, leverageOption]);

  function renderTokenInputs() {
    return (
      <>
        <BuyInputSection
          topLeftLabel={t`Pay`}
          bottomLeftValue={payUsd !== undefined ? formatUsd(payUsd) : ""}
          bottomRightValue={
            fromToken && fromToken.balance !== undefined && fromToken.balance > 0n ? (
              <>
                {formatBalanceAmount(fromToken.balance, fromToken.decimals, undefined, {
                  isStable: fromToken.isStable,
                })}{" "}
                <span className="text-typography-secondary">{fromToken.symbol}</span>
              </>
            ) : undefined
          }
          inputValue={fromTokenInputValue}
          onInputValueChange={handleFromInputTokenChange}
          onClickMax={showClickMax ? onMaxClick : undefined}
          qa="pay"
        >
          {fromTokenAddress &&
            (!isSettlementChain(chainId) || isNonEoaAccountOnAnyChain ? (
              <TokenSelector
                label={t`Pay`}
                chainId={chainId}
                tokenAddress={fromTokenAddress}
                onSelectToken={(token) => {
                  handleSelectFromTokenAddress(token.address, false);
                }}
                tokens={filteredSwapTokensForX10000}
                infoTokens={infoTokens}
                showSymbolImage={true}
                showTokenImgInDropdown={true}
                missedCoinsPlace={MissedCoinsPlace.payToken}
                extendedSortSequence={sortedLongAndShortTokens}
                qa="collateral-selector"
              />
            ) : (
              <MultichainTokenSelector
                isConnected={active}
                openConnectModal={openCantonConnect}
                walletIconUrls={walletIconUrls}
                chainId={chainId}
                srcChainId={srcChainId}
                label={t`Pay`}
                tokenAddress={fromTokenAddress}
                isGmxAccount={isFromTokenGmxAccount}
                onSelectTokenAddress={handleSelectFromTokenAddress}
                extendedSortSequence={sortedLongAndShortTokens}
                qa="collateral-selector"
                tokensData={filteredTokensDataForX10000}
                multichainTokens={multichainTokens}
                onDepositTokenAddress={onDepositTokenAddress}
              />
            ))}
        </BuyInputSection>

        {isSwap && (
          <>
            <div className="relative">
              {!isTwap && (
                <button
                  type="button"
                  disabled={!isSwitchTokensAllowed}
                  className={cx(
                    `absolute -top-19 left-1/2 flex size-36 -translate-x-1/2 cursor-pointer
                    items-center justify-center rounded-full bg-slate-600 text-typography-secondary`,
                    {
                      "hover:bg-[var(--color-fill-surfaceHover)] hover:bg-[linear-gradient(0deg,var(--color-slate-600),var(--color-slate-600))] hover:bg-blend-overlay":
                        isSwitchTokensAllowed,
                    }
                  )}
                  onClick={onSwitchTokens}
                  data-qa="swap-ball"
                >
                  <ArrowDownIcon className="block" />
                </button>
              )}
              <BuyInputSection
                topLeftLabel={isTwap ? t`Receive (Approximate)` : t`Receive`}
                bottomLeftValue={
                  !isTwap && swapAmounts?.usdOut !== undefined ? formatUsd(swapAmounts?.usdOut) : undefined
                }
                bottomRightValue={
                  !isTwap && toToken && toToken.balance !== undefined && toToken.balance > 0n
                    ? formatBalanceAmount(toToken.balance, toToken.decimals, toToken.symbol, {
                        isStable: toToken.isStable,
                      })
                    : undefined
                }
                inputValue={toTokenInputValue}
                onInputValueChange={handleToInputTokenChange}
                qa="swap-receive"
                isDisabled={isTwap}
              >
                {toTokenAddress && (
                  <TokenSelector
                    label={t`Receive`}
                    chainId={chainId}
                    tokenAddress={toTokenAddress}
                    onSelectToken={handleSelectToTokenAddress}
                    tokens={swapTokens}
                    infoTokens={infoTokens}
                    showSymbolImage={true}
                    showBalances={true}
                    showTokenImgInDropdown={true}
                    extendedSortSequence={sortedLongAndShortTokens}
                    qa="receive-selector"
                  />
                )}
              </BuyInputSection>
            </div>
          </>
        )}

        {isIncrease && (
          <BuyInputSection
            topLeftLabel={localizedTradeTypeLabels[tradeType!]}
            bottomLeftValue={
              increaseAmounts?.sizeDeltaUsd !== undefined
                ? formatUsd(increaseAmounts?.sizeDeltaUsd, { fallbackToZero: true })
                : ""
            }
            bottomRightLabel={t`Leverage`}
            bottomRightValue={displayedLeverage}
            inputValue={toTokenInputValue}
            onInputValueChange={handleToInputTokenChange}
            qa="buy"
          >
            {toTokenAddress && (
              <MarketSelector
                chainId={chainId}
                label={localizedTradeTypeLabels[tradeType!]}
                selectedIndexName={toToken ? getMarketIndexName({ indexToken: toToken, isSpotOnly: false }) : undefined}
                selectedMarketLabel={
                  toToken && (
                    <div className="flex items-center">
                      <TokenIcon className="mr-4" symbol={toToken.symbol} displaySize={20} />
                      <span>{getMarketIndexName({ indexToken: toToken, isSpotOnly: false })}</span>
                    </div>
                  )
                }
                markets={availableMarketsForX10000}
                isSideMenu
                missedCoinsPlace={MissedCoinsPlace.marketDropdown}
                onSelectMarket={handleSelectMarket}
                isX10000Mode
              />
            )}
          </BuyInputSection>
        )}
      </>
    );
  }

  function renderDecreaseSizeInput() {
    const showMaxButton = Boolean(
      effectiveSelectedPosition?.sizeInUsd && effectiveSelectedPosition.sizeInUsd > 0 && closeSizeInputValue !== formattedMaxCloseSize
    );

    return (
      <BuyInputSection
        topLeftLabel={t`Close`}
        bottomRightValue={effectiveSelectedPosition?.sizeInUsd ? formatUsd(effectiveSelectedPosition.sizeInUsd) : undefined}
        bottomLeftValue={formatUsd(closeSizeUsd)}
        inputValue={closeSizeInputValue}
        onInputValueChange={handleCloseInputChange}
        onClickBottomRightLabel={setMaxCloseSize}
        onClickMax={showMaxButton ? setMaxCloseSize : undefined}
        showPercentSelector={effectiveSelectedPosition?.sizeInUsd ? effectiveSelectedPosition.sizeInUsd > 0 : false}
        onPercentChange={handleClosePercentageChange}
        qa="close"
      >
        USD
      </BuyInputSection>
    );
  }

  function renderTriggerPriceInput() {
    const priceLabel = isLimit ? (tradeMode === TradeMode.Limit ? t`Limit Price` : t`Stop Price`) : t`Trigger Price`;

    return (
      <BuyInputSection
        topLeftLabel={priceLabel}
        topRightLabel={t`Mark`}
        topRightValue={formatUsdPrice(effectiveMarkPrice, {
          visualMultiplier: toToken?.visualMultiplier,
        })}
        onClickTopRightLabel={setMarkPriceAsTriggerPrice}
        inputValue={triggerPriceInputValue}
        onInputValueChange={handleTriggerPriceInputChange}
        qa="trigger-price"
      >
        USD
      </BuyInputSection>
    );
  }

  // Render separate Take Profit and Stop Loss inputs for TP/SL mode
  function renderSeparateTpSlInputs() {
    return (
      <div className="flex flex-col gap-8">
        {/* Take Profit Input */}
        <BuyInputSection
          topLeftLabel={t`Take Profit Price`}
          topRightLabel={t`Mark`}
          topRightValue={formatUsdPrice(effectiveMarkPrice, {
            visualMultiplier: toToken?.visualMultiplier,
          })}
          onClickTopRightLabel={() => {
            if (effectiveMarkPrice !== undefined) {
              setTakeProfitPriceInputValue(
                formatAmount(
                  effectiveMarkPrice,
                  USD_DECIMALS,
                  calculateDisplayDecimals(effectiveMarkPrice, undefined, toToken?.visualMultiplier),
                  undefined,
                  undefined,
                  toToken?.visualMultiplier
                )
              );
            }
          }}
          inputValue={takeProfitPriceInputValue}
          onInputValueChange={handleTakeProfitPriceInputChange}
          qa="take-profit-price"
        >
          USD
        </BuyInputSection>

        {/* Stop Loss Input */}
        <BuyInputSection
          topLeftLabel={t`Stop Loss Price`}
          topRightLabel={t`Mark`}
          topRightValue={formatUsdPrice(effectiveMarkPrice, {
            visualMultiplier: toToken?.visualMultiplier,
          })}
          onClickTopRightLabel={() => {
            if (effectiveMarkPrice !== undefined) {
              setStopLossPriceInputValue(
                formatAmount(
                  effectiveMarkPrice,
                  USD_DECIMALS,
                  calculateDisplayDecimals(effectiveMarkPrice, undefined, toToken?.visualMultiplier),
                  undefined,
                  undefined,
                  toToken?.visualMultiplier
                )
              );
            }
          }}
          inputValue={stopLossPriceInputValue}
          onInputValueChange={handleStopLossPriceInputChange}
          qa="stop-loss-price"
        >
          USD
        </BuyInputSection>
      </div>
    );
  }

  function renderTriggerRatioInput() {
    return (
      <BuyInputSection
        topLeftLabel={t`Limit Price`}
        topRightLabel={t`Mark`}
        topRightValue={formatAmount(markRatio?.ratio, USD_DECIMALS, 4)}
        onClickTopRightLabel={handleTriggerMarkPriceClick}
        inputValue={triggerRatioInputValue}
        onInputValueChange={handleTriggerRatioInputChange}
        qa="trigger-price"
      >
        {markRatio && (
          <>
            <TokenWithIcon symbol={markRatio.smallestToken.symbol} displaySize={20} /> per{" "}
            <TokenWithIcon symbol={markRatio.largestToken.symbol} displaySize={20} />
          </>
        )}
      </BuyInputSection>
    );
  }

  useKey(
    "Enter",
    () => {
      if (isCursorInside && (!submitButtonState.disabled || shouldDisableValidation)) {
        wrappedOnSubmit();
      }
    },
    {},
    [submitButtonState.disabled, shouldDisableValidation, isCursorInside, wrappedOnSubmit]
  );

  const buttonContent = (
    <Button
      qa="confirm-trade-button"
      variant="primary-action"
      className={cx("w-full [text-decoration:inherit]", { "short": !isLong && isPosition })}
      onClick={wrappedOnSubmit}
      disabled={submitButtonState.disabled && !shouldDisableValidation}
    >
      {submitButtonState.text}
    </Button>
  );
  const button = submitButtonState.tooltipContent ? (
    <Tooltip
      className="w-full"
      content={submitButtonState.tooltipContent}
      handle={buttonContent}
      isHandlerDisabled
      handleClassName="w-full"
      position="bottom"
      variant="none"
      contentClassName="w-full"
    />
  ) : (
    buttonContent
  );

  let nextLiqPriceFormatted = useMemo(() => {
    if (isTrigger && decreaseAmounts?.isFullClose) {
      return "-";
    }

    if (isIncrease && (increaseAmounts === undefined || increaseAmounts.sizeDeltaUsd === 0n)) {
      if (effectiveSelectedPosition) {
        return undefined;
      } else {
        return "-";
      }
    }

    return formatLiquidationPrice(nextPositionValues?.nextLiqPrice, {
      visualMultiplier: toToken?.visualMultiplier,
    });
  }, [
    isTrigger,
    decreaseAmounts?.isFullClose,
    isIncrease,
    increaseAmounts,
    nextPositionValues?.nextLiqPrice,
    toToken?.visualMultiplier,
    effectiveSelectedPosition,
  ]);

  const keepLeverage = useSelector(selectTradeboxKeepLeverage);
  const keepLeverageChecked = decreaseAmounts?.isFullClose ? false : keepLeverage ?? false;
  const setKeepLeverage = useSelector(selectTradeboxSetKeepLeverage);
  const settingsWarningDotVisible = useSelector(selectSettingsWarningDotVisible);

  // Express trading warnings removed for centralized version - handled server-side
  // const { shouldShowWarning: shouldShowOneClickTradingWarning } = useExpressTradingWarningsx10000({
  //   expressParams: submitButtonState.expressParams,
  //   payTokenAddress: fromTokenAddress,
  //   isWrapOrUnwrap,
  //   isGmxAccount: isFromTokenGmxAccount,
  // });

  const showSectionBetweenInputsAndButton =
    isPosition ||
    priceImpactWarningState.shouldShowWarning ||
    (!isTrigger && !isSwap) ||
    (isSwap && isLimit) ||
    isTwap ||
    maxAutoCancelOrdersWarning;
    // Express trading warnings removed for centralized version - handled server-side
    // shouldShowOneClickTradingWarning;

  // const tabsOptions = useMemo(() => {
  //   const modeToOptions = (mode: TradeMode) => ({
  //     value: mode,
  //     label: localizedTradeModeLabels[mode],
  //   });

  //   // For x10000 route, only show Market and Limit tabs, hide "More" dropdown
  //   // Filter to only include Market and Limit modes, and exclude array types (which would create "More" dropdown)
  //   return availableTradeModes
  //     .filter((mode) => {
  //       // Exclude arrays (which create "More" dropdown)
  //       if (Array.isArray(mode)) {
  //         return false;
  //       }
  //       // Only include Market and Limit modes
  //       return mode === TradeMode.Market || mode === TradeMode.Limit;
  //     })
  //     .map((mode) => modeToOptions(mode));
  // }, [availableTradeModes, localizedTradeModeLabels]);

  // x10000 mode: Only show Market, Limit, and TP/SL (Trigger)
  const tabsOptions = useMemo(() => {
    const x10000TradeModes = [TradeMode.Market, TradeMode.Limit, TradeMode.Trigger];
    return x10000TradeModes.map((mode) => ({
      value: mode,
      label: localizedTradeModeLabels[mode],
    }));
  }, [localizedTradeModeLabels]);

  return (
    <form className={cx("flex flex-col gap-8", { "tradebox-short": !isLong && isPosition })} onSubmit={handleFormSubmit} ref={formRef}>
      <div className="flex flex-col gap-12 rounded-b-8 bg-slate-900 py-12 pb-16">
        <div className="flex flex-col gap-12 px-12">
          <div className="flex items-center justify-between">
            <Tabs
              options={tabsOptions}
              type="inline"
              selectedValue={tradeMode}
              onChange={onSelectTradeMode}
              qa="trade-mode"
              className="bg-slate-900 text-13"
              regularOptionClassname="grow"
            />
            <div className="flex items-center gap-4">
              <TradeInfoIcon isMobile={isMobile} tradeType={tradeType} tradePlace="tradebox" />

              <div className="relative hidden">
                <SettingsIcon
                  className="size-16 cursor-pointer text-typography-secondary gmx-hover:text-typography-primary"
                  onClick={() => setIsSettingsVisible(true)}
                />
                {settingsWarningDotVisible && (
                  <div className="absolute bottom-6 right-3 h-6 w-6 rounded-full bg-red-400" />
                )}
              </div>
            </div>
          </div>
          <div className="text-body-medium flex grow flex-col gap-14">
            <div className="flex flex-col gap-4">
              {(isSwap || isIncrease) && renderTokenInputs()}
              {isTrigger && renderDecreaseSizeInput()}
              {isSwap && isLimit && renderTriggerRatioInput()}
              {isPosition && isLimit && renderTriggerPriceInput()}
              {isPosition && isTrigger && renderSeparateTpSlInputs()}
            </div>

            {twapRecommendation && (
              <ColorfulBanner color="blue" icon={InfoCircleIcon}>
                <div className="flex flex-col gap-8">
                  <span>
                    <span
                      className="cursor-pointer font-medium text-blue-300"
                      onClick={() => onSelectTradeMode(TradeMode.Twap)}
                    >
                      <Trans>Use a TWAP order</Trans>
                    </span>{" "}
                    <Trans> for lower net price impact.</Trans>
                  </span>
                </div>
              </ColorfulBanner>
            )}

            {showSectionBetweenInputsAndButton && (
              <div className="flex flex-col gap-14">
                {maxAutoCancelOrdersWarning}
                {isSwap && isLimit && !isTwap && !limitPriceWarningHidden && (
                  <AlertInfoCard onClose={() => setLimitPriceWarningHidden(true)}>
                    <Trans>
                      The actual execution price may differ from the set limit price due to fees and price impact. This
                      ensures that you receive at least the minimum receive amount.
                    </Trans>
                  </AlertInfoCard>
                )}

                {isPosition && (
                  <>
                    {isIncrease && isLeverageSliderEnabled && (
                      <div className="flex items-start gap-12">
                        <LeverageSlider
                          className="grow"
                          marks={leverageSliderMarks}
                          value={leverageOption}
                          onChange={handleLeverageSliderChange}
                          isPositive={isLong}
                          isSlim
                        />
                        <SuggestionInput
                          className="w-48 !rounded-8 py-5"
                          inputClassName="text-clip"
                          // TODO: 10000倍杠杆输入框显示逻辑 - 在以后迭代版本中启用
                          // value={leverageOption && leverageOption >= 10000 ? "10" : leverageInputValue}
                          value={leverageInputValue}
                          setValue={(val) => {
                            const parsed = Number(val);
                            if (!Number.isNaN(parsed) && parsed > 0) {
                              // TODO: 10000倍杠杆输入处理逻辑 - 在以后迭代版本中启用
                              // // 如果输入值 <= 50，直接作为杠杆值（切换回普通 x 模式）
                              // if (parsed <= 50) {
                              //   setLeverageOption(parsed);
                              //   setLeverageInputValue(val);
                              // } else if (parsed > 50 && parsed < 10000) {
                              //   // 大于 50 小于 10000 的值，跳转到 10000
                              //   setLeverageOption(10000);
                              //   setLeverageInputValue("10000");
                              // } else {
                              //   // 10000 或更大的值
                              //   setLeverageOption(parsed);
                              //   setLeverageInputValue(val);
                              // }
                              setLeverageOption(parsed);
                              setLeverageInputValue(val);
                            } else {
                              setLeverageInputValue(val);
                            }
                          }}
                          onBlur={handleLeverageInputBlur}
                          onKeyDown={handleLeverageInputKeyDown}
                          // TODO: 10000倍杠杆单位显示逻辑 - 在以后迭代版本中启用
                          // symbol={leverageOption && leverageOption >= 10000 ? "kx" : "x"}
                          symbol="x"
                        />
                      </div>
                    )}
                    {showHighLeverageWarning && (
                      <AlertInfoCard type="info" onClose={dismissHighLeverageWarning}>
                        <Trans>Using high leverage increases the risk of liquidation.</Trans>
                      </AlertInfoCard>
                    )}
                    {isTrigger && (
                      <SyntheticsInfoRow
                        label={t`Market`}
                        value={
                          <MarketSelector
                            chainId={chainId}
                            label={t`Market`}
                            selectedIndexName={
                              toToken ? getMarketIndexName({ indexToken: toToken, isSpotOnly: false }) : undefined
                            }
                            markets={availableMarketsForX10000}
                            isSideMenu
                            onSelectMarket={handleSelectMarket}
                            isX10000Mode
                          />
                        }
                      />
                    )}

                    {/* Pool selector removed for centralized version - market is selected via navigation dropdown */}
                    {/* <MarketPoolSelectorRowx10000 /> */}

                    {/* Collateral selector removed for centralized version - handled server-side */}
                    {/* <CollateralSelectorRowx10000
                      selectedMarketAddress={marketInfo?.marketTokenAddress}
                      onSelectCollateralAddress={onSelectCollateralAddress}
                      isMarket={isMarket}
                    /> */}
                  </>
                )}

                {isTwap && (
                  <TwapRows
                    duration={duration}
                    numberOfParts={numberOfParts}
                    setNumberOfParts={setNumberOfParts}
                    setDuration={setDuration}
                    sizeUsd={isSwap ? payUsd : increaseAmounts?.sizeDeltaUsd}
                    marketInfo={marketInfo}
                    type={isSwap ? "swap" : "increase"}
                    isLong={isLong}
                  />
                )}
              </div>
            )}
            <div className="flex flex-col gap-14">
              {isPosition && isTrigger && effectiveSelectedPosition && effectiveSelectedPosition?.leverage !== undefined && (
                <ToggleSwitch
                  isChecked={keepLeverageChecked}
                  setIsChecked={setKeepLeverage}
                  disabled={decreaseAmounts?.isFullClose}
                >
                  <span className="text-14 text-typography-secondary">
                    <Trans>Keep leverage at {formatLeverage(effectiveSelectedPosition.leverage)}</Trans>
                  </span>
                </ToggleSwitch>
              )}

              {false && !isTrigger && !isSwap && !isTwap && <LimitAndTPSLGroupx10000 />}

              {priceImpactWarningState.shouldShowWarning && (
                <HighPriceImpactOrFeesWarningCard
                  priceImpactWarningState={priceImpactWarningState}
                  swapPriceImpact={fees?.swapPriceImpact}
                  swapProfitFee={fees?.swapProfitFee}
                  executionFeeUsd={executionFee?.feeUsd}
                  externalSwapFeeItem={fees?.externalSwapFee}
                />
              )}

              <div>{button}</div>
              {/* Express trading warnings removed for centralized version - handled server-side */}
              {/* <ExpressTradingWarningCardx10000
                expressParams={submitButtonState.expressParams}
                payTokenAddress={!tradeFlags.isTrigger ? fromTokenAddress : undefined}
                isWrapOrUnwrap={!tradeFlags.isTrigger && isWrapOrUnwrap}
                disabled={shouldShowDepositButton}
                isGmxAccount={isFromTokenGmxAccount}
              /> */}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-14 rounded-8 bg-slate-900 p-12 pb-16">
        {/* Min receive row removed for centralized version - slippage handled server-side */}
        {/* {isSwap && !isTwap && <MinReceiveRowx10000 allowedSlippage={allowedSlippage} />} */}
        {isTrigger && effectiveSelectedPosition && decreaseAmounts?.receiveUsd !== undefined && (
          <SyntheticsInfoRow
            label={t`Receive`}
            value={formatTokenAmountWithUsd(
              decreaseAmounts.receiveTokenAmount,
              decreaseAmounts.receiveUsd,
              collateralToken?.symbol,
              collateralToken?.decimals
            )}
            valueClassName="numbers"
          />
        )}

        {isTrigger && (
          <SyntheticsInfoRow
            label={t`PnL`}
            value={
              <ValueTransition
                from={
                  <>
                    {formatDeltaUsd(decreaseAmounts?.estimatedPnl)} (
                    {formatPercentage(decreaseAmounts?.estimatedPnlPercentage, { signed: true })})
                  </>
                }
                to={
                  decreaseAmounts?.sizeDeltaUsd && decreaseAmounts.sizeDeltaUsd > 0 ? (
                    <>
                      {formatDeltaUsd(nextPositionValues?.nextPnl)} (
                      {formatPercentage(nextPositionValues?.nextPnlPercentage, { signed: true })})
                    </>
                  ) : undefined
                }
              />
            }
          />
        )}
        {isTrigger && effectiveSelectedPosition && (
          <SyntheticsInfoRow
            label={t`Leverage`}
            value={
              decreaseAmounts?.isFullClose ? (
                t`NA`
              ) : effectiveSelectedPosition.sizeInUsd === (decreaseAmounts?.sizeDeltaUsd || 0n) ? (
                "-"
              ) : (
                <ValueTransition
                  from={formatLeverage(effectiveSelectedPosition.leverage)}
                  to={formatLeverage(nextPositionValues?.nextLeverage)}
                />
              )
            }
            valueClassName="numbers"
          />
        )}
        {!(isTrigger && !effectiveSelectedPosition) && !isSwap && !isTwap && (
          <SyntheticsInfoRow
            label={t`Liquidation Price`}
            value={
              <ValueTransition
                from={
                  effectiveSelectedPosition
                    ? formatLiquidationPrice(effectiveSelectedPosition?.liquidationPrice, {
                        visualMultiplier: toToken?.visualMultiplier,
                      })
                    : undefined
                }
                to={nextLiqPriceFormatted}
              />
            }
          />
        )}
        {/* Price Impact / Fees row is hidden in x10000 mode */}
        {/* {!isTwap && <PriceImpactFeesRowx10000 />} */}
        {/* Execution details removed for centralized version - fees handled server-side */}
        {/* <TradeBoxAdvancedGroupsx10000
          slippageInputId={submitButtonState.slippageInputId}
          gasPaymentParams={submitButtonState.expressParams?.gasPaymentParams}
          totalExecutionFee={submitButtonState.totalExecutionFee}
        /> */}
      </div>
    </form>
  );
}
