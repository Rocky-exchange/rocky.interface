import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  spotApi,
  SPOT_MARKETS,
  SpotApiError,
  type Account,
  type DepthResp,
  type SpotOrder,
  type Ticker24h,
  type Trade,
} from "../api/spotClient";

// ── Small polling hook (no swr dep, plain setInterval) ─────────────────────

function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await fn();
        if (alive) {
          setData(d);
          setErr(null);
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const iv = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, err };
}

// ── Symbol switcher ────────────────────────────────────────────────────────

function SymbolSwitcher({ active }: { active: string }) {
  return (
    <div className="flex items-center gap-1">
      {SPOT_MARKETS.map((m) => {
        const on = m.symbol === active;
        return (
          <Link
            key={m.symbol}
            to={`/spot/${m.symbol}`}
            className={`px-3 py-1 text-sm rounded border-b-2 transition-colors ${
              on
                ? "text-emerald-400 border-emerald-500"
                : "text-zinc-400 hover:text-zinc-200 border-transparent"
            }`}
          >
            {m.base}/{m.quote}
          </Link>
        );
      })}
    </div>
  );
}

// ── 24h ticker top bar ─────────────────────────────────────────────────────

function TopBar({ symbol }: { symbol: string }) {
  const { data: t } = usePolling<Ticker24h>(() => spotApi.ticker(symbol), 3000, [symbol]);
  if (!t) return <span className="text-xs text-zinc-500">loading…</span>;
  const pct = parseFloat(t.priceChangePercent);
  const pctCls = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-rose-400" : "text-zinc-400";
  const cell = (label: string, value: string) => (
    <div className="flex flex-col leading-3">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="font-semibold text-zinc-100">{t.lastPrice}</span>
      <div className="flex flex-col leading-3">
        <span className="text-[10px] text-zinc-500">24h Change</span>
        <span className={pctCls}>
          {t.priceChange} ({pct.toFixed(3)}%)
        </span>
      </div>
      {cell("24h High", t.highPrice)}
      {cell("24h Low", t.lowPrice)}
      {cell("24h Vol " + symbol.split("-")[0], t.volume)}
      {cell("24h Vol USDCx", t.quoteVolume)}
    </div>
  );
}

// ── Orderbook ──────────────────────────────────────────────────────────────

function Orderbook({ symbol }: { symbol: string }) {
  const { data, err } = usePolling<DepthResp>(() => spotApi.depth(symbol, 20), 1000, [symbol]);
  if (err) return <div className="text-[11px] p-2 text-rose-400">{err}</div>;
  if (!data) return <div className="text-[11px] p-2 text-zinc-500">loading…</div>;

  const bids = data.bids.slice(0, 13);
  const asks = data.asks.slice(0, 13);
  if (bids.length === 0 && asks.length === 0) {
    return <div className="text-[11px] p-2 text-zinc-500">no resting orders</div>;
  }
  const askRows = asks.reduce<Array<{ p: string; q: string; total: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q) });
    return acc;
  }, []);
  const bidRows = bids.reduce<Array<{ p: string; q: string; total: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q) });
    return acc;
  }, []);
  const maxTotal = Math.max(
    askRows[askRows.length - 1]?.total ?? 0,
    bidRows[bidRows.length - 1]?.total ?? 0,
    1e-9,
  );
  const bestAsk = parseFloat(asks[0]?.[0] || "0");
  const bestBid = parseFloat(bids[0]?.[0] || "0");
  const spread = bestAsk - bestBid;
  const spreadPct = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;

  return (
    <div className="font-mono text-[11px] leading-[16px]">
      <div className="grid grid-cols-3 px-2 py-1 text-zinc-500 border-b border-zinc-800">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {askRows
        .slice()
        .reverse()
        .map((r, i) => {
          const pct = (r.total / maxTotal) * 100;
          return (
            <div key={`a${i}`} className="relative grid grid-cols-3 px-2 h-4">
              <div
                className="absolute inset-y-0 right-0 bg-rose-500/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative text-rose-400">{r.p}</span>
              <span className="relative text-right text-zinc-200">{r.q}</span>
              <span className="relative text-right text-zinc-500">{r.total.toFixed(4)}</span>
            </div>
          );
        })}
      <div className="px-2 py-1 border-y border-zinc-800 flex justify-between text-zinc-400">
        <span>Spread</span>
        <span>
          {spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>
      {bidRows.map((r, i) => {
        const pct = (r.total / maxTotal) * 100;
        return (
          <div key={`b${i}`} className="relative grid grid-cols-3 px-2 h-4">
            <div
              className="absolute inset-y-0 right-0 bg-emerald-500/10"
              style={{ width: `${pct}%` }}
            />
            <span className="relative text-emerald-400">{r.p}</span>
            <span className="relative text-right text-zinc-200">{r.q}</span>
            <span className="relative text-right text-zinc-500">{r.total.toFixed(4)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent trades ──────────────────────────────────────────────────────────

function RecentTrades({ symbol }: { symbol: string }) {
  const { data } = usePolling<Trade[]>(() => spotApi.trades(symbol, 30), 1500, [symbol]);
  if (!data || data.length === 0) {
    return <div className="text-[11px] p-2 text-zinc-500">no trades yet</div>;
  }
  return (
    <div className="font-mono text-[11px] leading-[16px]">
      <div className="grid grid-cols-3 px-2 py-1 text-zinc-500 border-b border-zinc-800">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {data.map((t) => {
        const takerBuy = !t.isBuyerMaker;
        const cls = takerBuy ? "text-emerald-400" : "text-rose-400";
        const time = new Date(t.time).toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return (
          <div key={t.id} className="grid grid-cols-3 px-2 h-4">
            <span className={cls}>{t.price}</span>
            <span className="text-right text-zinc-200">{t.qty}</span>
            <span className="text-right text-zinc-500">{time}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Order form (LIMIT only for v1) ─────────────────────────────────────────

function OrderForm({ symbol }: { symbol: string }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [base, quote] = useMemo(() => symbol.split("-"), [symbol]);
  const notional = useMemo(() => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    return isFinite(p) && isFinite(q) ? (p * q).toFixed(4) : "—";
  }, [price, qty]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await spotApi.placeOrder({
        symbol,
        side,
        type: "LIMIT",
        price,
        quantity: qty,
      });
      setMsg({ kind: "ok", text: `${r.status} · id ${r.orderId}` });
      setPrice("");
      setQty("");
    } catch (e: unknown) {
      const msgTxt =
        e instanceof SpotApiError
          ? `[${e.code}] ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setMsg({ kind: "err", text: msgTxt });
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || !price || !qty;

  return (
    <div className="p-2 flex flex-col gap-2 text-xs">
      <div className="flex gap-1">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`flex-1 py-1.5 rounded ${
              side === s
                ? s === "BUY"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500"
                : "bg-zinc-800/50 text-zinc-400 border border-zinc-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Price ({quote})</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="500"
          inputMode="decimal"
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Quantity ({base})</span>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0.1"
          inputMode="decimal"
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </label>
      <div className="flex justify-between text-zinc-500 pt-1">
        <span>Notional</span>
        <span className="text-zinc-300">
          {notional} <span className="text-zinc-500">{quote}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className={`mt-1 py-2 rounded font-semibold text-zinc-950 ${
          side === "BUY"
            ? "bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40"
            : "bg-rose-500 hover:bg-rose-400 disabled:bg-rose-500/40"
        }`}
      >
        {busy ? "Sending…" : `${side} ${base}`}
      </button>
      {msg && (
        <div
          className={`text-[11px] px-2 py-1 rounded break-all ${
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-rose-500/10 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── Open orders + account panel ────────────────────────────────────────────

function OpenOrdersTab({ symbol }: { symbol: string }) {
  const { data, err } = usePolling<SpotOrder[]>(() => spotApi.openOrders(symbol), 2000, [symbol]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await spotApi.cancelOrder(symbol, orderId);
    } finally {
      setCancelling(null);
    }
  };

  if (err) return <div className="text-[11px] p-2 text-rose-400">{err}</div>;
  if (!data || data.length === 0) {
    return <div className="text-[11px] p-2 text-zinc-500">no open orders</div>;
  }
  return (
    <div className="p-2 text-xs font-mono">
      <div className="grid grid-cols-6 gap-x-2 text-[10px] text-zinc-500 pb-1 border-b border-zinc-800">
        <span>Symbol</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Filled</span>
        <span className="text-right">Action</span>
      </div>
      {data.map((o) => (
        <div key={o.orderId} className="grid grid-cols-6 gap-x-2 py-1 text-[11px]">
          <span className="text-zinc-200">{o.symbol}</span>
          <span className={o.side === "BUY" ? "text-emerald-400" : "text-rose-400"}>{o.side}</span>
          <span className="text-right text-zinc-200">{o.price}</span>
          <span className="text-right text-zinc-200">{o.origQty}</span>
          <span className="text-right text-zinc-400">{o.executedQty}</span>
          <button
            type="button"
            onClick={() => cancel(o.orderId)}
            disabled={cancelling === o.orderId}
            className="text-right text-rose-400 hover:text-rose-300 disabled:text-rose-700"
          >
            {cancelling === o.orderId ? "…" : "cancel"}
          </button>
        </div>
      ))}
    </div>
  );
}

function AccountPanel() {
  const { data, err } = usePolling<Account>(() => spotApi.account(), 2500, []);
  if (err) return <div className="text-[11px] p-2 text-rose-400">{err}</div>;
  if (!data) return <div className="text-[11px] p-2 text-zinc-500">loading…</div>;
  return (
    <div className="p-2 text-xs font-mono">
      <div className="text-[10px] text-zinc-500 mb-1">Spot balances</div>
      <div className="grid grid-cols-4 gap-x-2 text-[11px]">
        <span className="text-zinc-500">Asset</span>
        <span className="text-zinc-500 text-right">Free</span>
        <span className="text-zinc-500 text-right">Locked</span>
        <span className="text-zinc-500 text-right">Total</span>
        {data.balances.map((b) => {
          const total = (parseFloat(b.free) + parseFloat(b.locked)).toString();
          return (
            <div key={b.asset} className="contents">
              <span className="text-zinc-200">{b.asset}</span>
              <span className="text-right text-zinc-200">{b.free}</span>
              <span className="text-right text-zinc-500">{b.locked}</span>
              <span className="text-right text-zinc-400">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Book / Trades tab switcher ─────────────────────────────────────────────

function OrderbookTradesTabs({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-zinc-800 text-[11px]">
        {(["book", "trades"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 ${
              tab === t
                ? "text-emerald-400 border-b-2 border-emerald-500 -mb-px"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t === "book" ? "Orderbook" : "Trades"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "book" ? <Orderbook symbol={symbol} /> : <RecentTrades symbol={symbol} />}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SpotTradePage() {
  const params = useParams<{ symbol?: string }>();
  const symbol = params.symbol ?? "CBTC-USDCX";
  return (
    <div
      className="grid p-1 gap-1 bg-zinc-950 text-zinc-100"
      style={{
        height: "100vh",
        gridTemplateColumns: "minmax(0, 1fr) 260px 320px",
        gridTemplateRows: "40px minmax(0, 1fr) 220px",
      }}
    >
      {/* Row 1: symbol tabs + 24h ticker */}
      <div className="col-span-3 px-2 flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900/40">
        <SymbolSwitcher active={symbol} />
        <div className="w-px h-5 bg-zinc-700" />
        <TopBar symbol={symbol} />
      </div>
      {/* Chart placeholder */}
      <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/40 flex items-center justify-center text-xs text-zinc-500">
        <div className="text-center">
          <div className="font-semibold text-zinc-300">{symbol}</div>
          <div className="mt-1">chart placeholder — /api/v3/klines already live</div>
        </div>
      </div>
      <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/40">
        <OrderbookTradesTabs symbol={symbol} />
      </div>
      <div className="overflow-y-auto rounded border border-zinc-800 bg-zinc-900/40">
        <OrderForm symbol={symbol} />
      </div>
      <div className="col-span-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/40">
        <OpenOrdersTab symbol={symbol} />
      </div>
      <div className="overflow-y-auto rounded border border-zinc-800 bg-zinc-900/40">
        <AccountPanel />
      </div>
    </div>
  );
}
