declare const _default: readonly [{
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }];
    readonly name: "EmptyMultichainTransferInAmount";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "balance";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "InsufficientMultichainBalance";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "endpoint";
        readonly type: "address";
    }];
    readonly name: "InvalidMultichainEndpoint";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "provider";
        readonly type: "address";
    }];
    readonly name: "InvalidMultichainProvider";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "contract DataStore";
        readonly name: "dataStore";
        readonly type: "DataStore";
    }, {
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }];
    readonly name: "getMultichainBalanceAmount";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "contract DataStore";
        readonly name: "dataStore";
        readonly type: "DataStore";
    }, {
        readonly internalType: "address";
        readonly name: "endpoint";
        readonly type: "address";
    }];
    readonly name: "validateMultichainEndpoint";
    readonly outputs: readonly [];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "contract DataStore";
        readonly name: "dataStore";
        readonly type: "DataStore";
    }, {
        readonly internalType: "address";
        readonly name: "provider";
        readonly type: "address";
    }];
    readonly name: "validateMultichainProvider";
    readonly outputs: readonly [];
    readonly stateMutability: "view";
    readonly type: "function";
}];
export default _default;
