# Modules 业务层

此目录包含所有业务逻辑，按业务域完全隔离。

## 核心原则：业务自治 (Business Autonomy)

- **隔离优于复用**：宁可代码重复，不可逻辑耦合
- **各司其职**：每个模块拥有独立的 UI 风格、数据流、API 处理逻辑
- **极简共享**：如需共享代码，放入 `shared/` 目录

## 目录结构

```
modules/
├── dex/        # DEX 去中心化交易（链上交易代码）
├── cex/        # CEX 中心化交易
└── landing/    # 官网
```

## 禁止行为 🚫

```typescript
// ❌ 禁止跨模块引用
import { CexButton } from '@/modules/cex/components'  // 不允许出现在 dex 模块中

// ✅ 正确做法：复制一份到自己的模块目录下
import { DexButton } from './components/DexButton'
```

## 样式隔离

各模块根组件需包裹专属 Class：

```tsx
// modules/cex/pages/TradePage.tsx
<div className="cex-scope">
  {/* CEX 交易页面内容 */}
</div>

// modules/dex/pages/TradePage.tsx
<div className="dex-scope">
  {/* DEX 交易页面内容 */}
</div>
```

## 产物隔离

使用 React.lazy 进行模块加载，确保：
- 访问 Landing 官网时，不下载 ethers.js (DEX) 或图表库 (CEX)
