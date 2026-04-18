import { ExternalSwapPath } from "../../types/trade";
export declare const AVAILABLE_BOTANIX_DEPOSIT_PAIRS: {
    from: string;
    to: string;
}[];
export declare const AVAILABLE_BOTANIX_WITHDRAW_PAIRS: {
    from: string;
    to: string;
}[];
export declare const getAvailableExternalSwapPaths: ({ chainId, fromTokenAddress, }: {
    chainId: number;
    fromTokenAddress: string;
}) => ExternalSwapPath[];
