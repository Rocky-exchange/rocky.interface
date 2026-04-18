# DEX Module - 去中心化交易

完全隔离的链上交易代码。

## 目录结构

```
dex/
├── chains/       # 链配置（Ethereum、Arbitrum 等）
├── components/   # DEX 专属组件
├── contracts/    # ABI 与合约交互逻辑
├── domain/       # 业务逻辑
│   ├── synthetics/   # 合成资产交易逻辑
│   ├── multichain/   # 多链支持
│   ├── tokens/       # 代币处理
│   ├── prices/       # 价格获取
│   ├── stake/        # 质押逻辑
│   └── vesting/      # 归属逻辑
├── features/     # 功能模块
│   ├── trade/        # 交易功能
│   ├── x10000trade/  # x10000 交易模式
│   ├── pools/        # 流动性池
│   ├── earn/         # 收益功能
│   ├── accounts/     # 账户管理
│   └── ...
├── hooks/        # DEX 专属 hooks
├── lib/          # DEX 专属工具
│   ├── gas/          # Gas 估算
│   ├── multicall/    # 批量调用
│   ├── rpc/          # RPC 管理
│   ├── sdk/          # SDK 集成
│   └── transactions/ # 交易处理
├── pages/        # 页面组件
├── route/        # DEX 路由配置
├── store/        # 状态管理 (Contexts)
│   ├── SyntheticsStateContext/
│   ├── ChainContext/
│   └── ...
├── wallets/      # 钱包集成
├── img/          # DEX 专属图片
└── locales/      # DEX 专属本地化
```

## 依赖关系

✅ 可以引用：
- `@/shared/*` - 共享工具
- 本模块内部代码

🚫 禁止引用：
- `@/modules/cex/*`
- `@/modules/landing/*`
