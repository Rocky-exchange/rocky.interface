# CEX Module - 中心化交易 (X10000)

完全隔离的中心化交易代码。X10000 模式使用后端 API 进行数据获取和交易。

## 目录结构

```
cex/
├── components/       # CEX 专属组件
│   ├── TradeBoxx10000/      # X10000 交易面板
│   ├── OrderBookx10000/     # X10000 订单簿
│   ├── X10000MarketsList/   # 市场列表
│   ├── X10000Debug/         # 调试组件
│   └── AppHeader/           # CEX 专属头部
├── features/         # 功能模块
│   └── x10000trade/         # X10000 交易功能
├── lib/              # CEX 专属工具
│   └── api/                 # API 客户端
│       ├── custom/          # X10000 API 实现
│       │   ├── client.ts    # REST API 客户端
│       │   ├── websocket.ts # WebSocket 客户端
│       │   ├── useZtdxAuth.ts    # 认证 hook
│       │   ├── useApiOrders.ts   # 订单 hook
│       │   ├── useApiPositions.ts # 持仓 hook
│       │   └── ...
│       ├── types.ts         # API 类型定义
│       └── index.ts         # API 导出
├── pages/            # 页面组件
│   └── Syntheticsx10000Page/
├── store/            # 状态管理
│   └── X10000StateContext/  # X10000 模式状态
├── route/            # CEX 路由配置
├── services/         # CEX 服务层
├── hooks/            # CEX 专属 hooks
├── img/              # CEX 专属图片
└── locales/          # CEX 专属本地化
```

## 依赖关系

✅ 可以引用：
- `@/shared/*` - 共享工具
- 本模块内部代码

🚫 禁止引用：
- `@/modules/dex/*`
- `@/modules/landing/*`
