# 自定义公开用户名（Profile Display Name）设计

日期：2026-07-09
状态：已确认，待实现

## 目标

用户可在 exchange 里设置一个 **全局唯一的公开名字**，覆盖钱包登录时的默认名。名字对所有人可见（首个落点是 Leaderboard），按链上身份 `party_id` 存储和解析。未设置自定义名字时，回退到现有的 `钱包 displayName/alias → 截断 party` 链。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 可见范围 | 公开（给所有人看）→ 后端持久化 |
| 唯一性 | 全局唯一（大小写不敏感），冲突报错 |
| 唯一性绑定对象 | 绑 `party_id`（一人一 party 一名；换名释放旧名）。同一 user 的多个 party 绑定**不**自动共享名字 |
| 编辑入口 | `CantonFundsModal` 顶部身份区块 |
| 查重接口 | 不做。仅靠保存时 `409` 报错 |

## 非目标（YAGNI）

- 头像、简介、社交链接等 profile 扩展字段
- 按 user 聚合名字（跨 party 共享）
- 输入时实时查重接口
- 名字历史 / 审计

---

## 1. 数据模型（rocky-backend）

新 migration：`services/api-gateway/migrations/20260709001_profile_display_name.sql`

```sql
CREATE TABLE IF NOT EXISTS auth.profiles (
    party_id            TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    display_name_lower  TEXT NOT NULL UNIQUE,   -- 全局唯一，大小写不敏感
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

设计说明：
- 按 `party_id` 存 —— 这是订单 / 成交 / Leaderboard 里出现的链上身份，不复用 `auth.users`（钱包登录走 `wallet_provider_bindings`，不保证建 `auth.users` 行）。
- 唯一性约束打在 `display_name_lower` 上，防止仅大小写差异的冒充。`display_name` 保留用户输入的原始大小写用于展示。
- 换名 = upsert 同一 `party_id` 行，旧名随之释放（旧 `display_name_lower` 被覆盖）。

## 2. API（services/api-gateway/src/routes/profile.rs，新文件）

复用现有 session 解析（`Authorization: Bearer <exchange session token>`，与 `wallet.rs` 的 `get_session` / `require_rocky_party` 同一套）。

| 方法 | 路径 | 认证 | 作用 |
|---|---|---|---|
| `PUT` | `/v1/profile/name` | 需 session | 取当前 session 的 `party_id`，upsert 自己的 `display_name`；唯一冲突 → `409` |
| `POST` | `/v1/profile/names` | 无 | 批量按 `parties[]` 查名字，供 Leaderboard 等展示 |

### PUT /v1/profile/name

请求：
```json
{ "display_name": "Alice" }
```
处理：
1. 从 Authorization header 解析 session → `party_id`。无 session → `401`。
2. 服务端校验名字（见下）。不合法 → `400`。
3. `INSERT ... ON CONFLICT (party_id) DO UPDATE SET display_name, display_name_lower, updated_at`。
4. 唯一约束（`display_name_lower`）冲突 → `409`，body `{ "error": "name taken" }`。
5. 成功返回 `{ "party_id": "...", "display_name": "Alice" }`。

### POST /v1/profile/names

请求：
```json
{ "parties": ["p1", "p2", "..."] }
```
返回（只含有名字的 party）：
```json
{ "names": { "p1": "Alice", "p2": "Bob" } }
```

### 服务端校验规则（PUT 权威校验）

- 去除首尾空格。
- 长度 3–20。
- 字符集 `[a-zA-Z0-9_]`。
- 不满足 → `400`，`{ "error": "invalid name" }`。

## 3. 前端（rocky.interface）

### 3.1 接口封装：`src/shared/lib/canton-wallet/profile.ts`（新文件）

- `setDisplayName(name: string): Promise<{ party_id: string; display_name: string }>`
  - `PUT /v1/profile/name`，走 `exchangeSessionHeaders()`。
  - 成功后：写回 `localStorage.mtc_username = display_name`，调用 `notifyCantonSessionChange()`。
  - `409` → 抛出可识别错误（前端提示"名字已被占用"）。
  - `400` → 抛出"名字不合法"。
- `resolveNames(parties: string[]): Promise<Record<string, string>>`
  - `POST /v1/profile/names`，无认证。

### 3.2 编辑 UI：`CantonFundsModal.tsx` 顶部身份区块

- 在现有 username 显示处（`CantonFundsModal.tsx:336` 附近）加"编辑"按钮。
- 点击 → 内联输入框（预填当前 `username`）+ 保存 / 取消。
- 前端做轻量即时校验（长度/字符）仅作提示；权威校验在服务端。
- 保存成功 → 关闭编辑态；`useCantonSession` 因 `notifyCantonSessionChange()` 刷新，TopNav 名字立即更新。
- 保存失败（409/400）→ 就地红字报错，不关闭输入框。

### 3.3 解析 hook：`useResolvedNames(parties: string[])`

- 批量调用 `resolveNames` + 内存缓存（避免重复请求）。
- 返回 `Record<party, displayName>`。
- 消费方：`LeaderboardRow` 展示的 `address` 改为：有名字则显示 `名字·<party 截断>`，无名字仍显示原截断地址。`addressTitle` 保留完整 party。

### 3.4 回退与展示优先级

显示名解析链（与 `session.ts:69` 现有逻辑对齐）：

```
profiles.display_name  →  钱包 displayName/alias  →  party.slice(0, 8) + "…"
```

- 自己（TopNav / FundsModal）：`useCantonSession().username`，已由保存流程写回 `mtc_username`。
- 他人（Leaderboard 等）：`useResolvedNames`；未命中回退到截断 party。

## 4. 测试

### 后端（services/api-gateway/tests/，参考 `wallet_routes.rs`）
- `PUT /v1/profile/name`：新建、更新（换名释放旧名）、无 session `401`、非法名 `400`。
- 唯一冲突：两个 party 抢同名（含仅大小写不同）→ 第二个 `409`。
- `POST /v1/profile/names`：批量查，返回只含有名字的 party。

### 前端（rocky.interface）
- `profile.test.ts`：`setDisplayName` 成功写回 + notify；`409`/`400` 错误映射；`resolveNames` 请求形状。
- `CantonFundsModal` 编辑交互：进入编辑态、保存成功刷新、保存失败就地报错。

## 5. 实现与运行约束

- 本机（Mac）**只写代码**。migration 执行、`cargo` 编译/测试、前后端联调**全部在 EC2 跑**（符合 code-only 约束）。
- 后端改动：新 migration + 新 `profile.rs` + 路由注册（`.route("/v1/profile/name", put(...))` 等，参考 `wallet.rs:184` 的注册块）。
- 前端改动：新 `profile.ts` + `useResolvedNames` + `CantonFundsModal` 编辑区 + `LeaderboardRow` 消费解析名。

## 涉及文件清单

后端：
- `services/api-gateway/migrations/20260709001_profile_display_name.sql`（新）
- `services/api-gateway/src/routes/profile.rs`（新）
- 路由注册处（`wallet.rs` 同级的 router 组装）
- `services/api-gateway/tests/profile_routes.rs`（新）

前端：
- `src/shared/lib/canton-wallet/profile.ts`（新）
- `src/shared/lib/canton-wallet/CantonFundsModal.tsx`（改：编辑区）
- `src/shared/ui/LeaderboardRow/LeaderboardRow.tsx` + 其数据源（改：消费解析名）
- `src/shared/lib/canton-wallet/profile.test.ts`（新）
