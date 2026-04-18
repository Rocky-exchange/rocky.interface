import type { GmxSdk } from "..";
export declare class Module {
    sdk: GmxSdk;
    constructor(sdk: GmxSdk);
    get oracle(): import("./oracle").Oracle;
    get chainId(): import("../configs/chains").ContractsChainId;
    get account(): string;
}
