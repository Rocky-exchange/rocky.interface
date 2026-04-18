import { TokensData } from "../../types/tokens";
import { ExternalSwapQuote } from "../../types/trade";
export declare const getBotanixStakingExternalSwapQuote: ({ tokenInAddress, tokenOutAddress, amountIn, gasPrice, receiverAddress, tokensData, assetsPerShare, }: {
    tokenInAddress: string;
    tokenOutAddress: string;
    amountIn: bigint;
    gasPrice: bigint;
    receiverAddress: string;
    tokensData: TokensData;
    assetsPerShare: bigint;
}) => ExternalSwapQuote | undefined;
