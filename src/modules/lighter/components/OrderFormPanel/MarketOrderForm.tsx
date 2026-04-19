import { useEffect, useMemo, useRef, useState } from "react";

import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter } from "../../adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "../../adapters/usePlaceOrderAdapter";
import { Checkbox } from "../Checkbox/Checkbox";
import { PercentSlider } from "../PercentSlider/PercentSlider";

type Props = {
  side: "buy" | "sell";
  isConnected: boolean;
  leverage: number;
  marginMode: "cross" | "isolated";
};

export function MarketOrderForm({ side, isConnected, leverage, marginMode }: Props) {
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<"SYMBOL" | "USD">("USD");
  const [pct, setPct] = useState(0);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [tpGain, setTpGain] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [slLoss, setSlLoss] = useState("");
  const { placeOrder, submitting } = usePlaceOrderAdapter();
  const market = useMarketInfoAdapter();
  const { available } = useAvailableBalanceAdapter();
  const baseSymbol = market.symbol || "BTC";
  const amountUnitOptions = useMemo(() => [baseSymbol, "USD"] as const, [baseSymbol]);
  // 用户输入的数值;根据 amountUnit 换算为合约数量(BTC)作为 amountNum
  const rawAmount = Number(amount) || 0;
  const markPrice = market.markPrice ?? null;
  const amountNum = amountUnit === "USD" && markPrice && markPrice > 0 ? rawAmount / markPrice : rawAmount;
  const preview = useOrderPreviewAdapter({
    side,
    orderType: "market",
    amount: amountNum,
    leverage,
    marginMode,
    reduceOnly,
  });
  const p = preview.data;
  const fmtUsd = (s?: string) =>
    s ? `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";
  const fmtPct = (s?: string) => (s ? `${(Number(s) * 100).toFixed(2)}%` : "-");

  const submit = () =>
    placeOrder({
      side,
      type: "market",
      amount: amountNum,
      leverage,
      marginMode,
      reduceOnly,
      tpPrice: tpsl && tpPrice ? Number(tpPrice) : undefined,
      slPrice: tpsl && slPrice ? Number(slPrice) : undefined,
      maxSlippage: p?.max_slippage ? Number(p.max_slippage) : undefined,
    });

  return (
    <div className="ltr-form">
      <div className="ltr-form__section">
        <Row
          label="Available to Trade"
          value={
            p?.available_balance
              ? fmtUsd(p.available_balance)
              : available != null
                ? `$${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "-"
          }
        />
        <Row label="Position" value="-" />
      </div>

      <div className="ltr-form__section">
        <FormField label="Amount">
          <input
            className="ltr-form__input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              // 手动修改 amount 后,按当前余额+价格重算百分比(整数)
              const typed = Number(e.target.value) || 0;
              const bal = p?.available_balance ? Number(p.available_balance) : available;
              const price = markPrice ?? (p?.est_price ? Number(p.est_price) : null);
              if (bal != null && bal > 0) {
                const usdValue = amountUnit === "USD" ? typed : price ? typed * price : 0;
                const nextPct = Math.max(0, Math.min(100, Math.round((usdValue / bal) * 100)));
                setPct(nextPct);
              } else {
                setPct(0);
              }
            }}
            placeholder={amountUnit === "USD" ? "0.00" : "0.00000"}
            inputMode="decimal"
          />
          <CoinSelect
            value={amountUnit === "USD" ? "USD" : baseSymbol}
            options={amountUnitOptions}
            onChange={(v) => {
              const next = v === "USD" ? "USD" : "SYMBOL";
              // 切换单位时,按当前 markPrice 换算数值,避免丢失输入
              if (next !== amountUnit && rawAmount > 0 && markPrice && markPrice > 0) {
                const newVal = next === "USD" ? rawAmount * markPrice : rawAmount / markPrice;
                setAmount(newVal.toFixed(next === "USD" ? 2 : 5));
              }
              setAmountUnit(next);
            }}
          />
        </FormField>

        <PercentSlider
          value={pct}
          onChange={(next) => {
            setPct(next);
            const bal = p?.available_balance ? Number(p.available_balance) : available;
            const price = market.markPrice ?? (p?.est_price ? Number(p.est_price) : null);
            if (bal != null && price != null && price > 0) {
              // 余额是 USD;USD 模式直接用 bal×pct,SYMBOL 模式换算为代币数量
              const newAmount =
                amountUnit === "USD" ? (bal * (next / 100)).toFixed(2) : ((bal * (next / 100)) / price).toFixed(5);
              setAmount(newAmount);
            }
          }}
          side={side}
        />

        {isConnected && (
          <button onClick={submit} disabled={submitting} className={`ltr-form__submit ltr-form__submit--${side}`}>
            {side === "buy" ? "Buy / Long" : "Sell / Short"}
          </button>
        )}

        <Checkbox
          checked={reduceOnly}
          onChange={(checked) => {
            setReduceOnly(checked);
            if (checked) setTpsl(false);
          }}
          label="Reduce Only"
        />
        {!reduceOnly && (
          <Checkbox
            checked={tpsl}
            onChange={(checked) => {
              setTpsl(checked);
              if (checked) setReduceOnly(false);
            }}
            label="Take Profit / Stop Loss"
          />
        )}

        {tpsl && (
          <div className="ltr-form__grid2">
            <FormField label="TP Price">
              <input
                className="ltr-form__input"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Gain">
              <input
                className="ltr-form__input"
                value={tpGain}
                onChange={(e) => setTpGain(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <UnitSelect unit="%" />
            </FormField>
            <FormField label="SL Price">
              <input
                className="ltr-form__input"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Loss">
              <input
                className="ltr-form__input"
                value={slLoss}
                onChange={(e) => setSlLoss(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <UnitSelect unit="%" />
            </FormField>
          </div>
        )}
      </div>

      <div className="ltr-form__section">
        <Row label="Order Size" value={p?.order_size_symbol ?? "-"} />
        <Row label="Order Value" value={fmtUsd(p?.order_value)} />
        <Row label="Est. Liq. Price" value={p?.est_liq_price ? Number(p.est_liq_price).toLocaleString() : "-"} />
        <Row
          label="Position Margin"
          value={fmtUsd(p?.position_margin_after) === "-" ? "$0.00" : fmtUsd(p?.position_margin_after)}
        />
        <Row label="Est. Price" value={p?.est_price ? Number(p.est_price).toLocaleString() : "-"} />
        <Row
          label="Slippage"
          value={`Est: ${fmtPct(p?.est_slippage) || "0.00%"} | Max: ${fmtPct(p?.max_slippage) || "1.00%"}`}
          valueLink
        />
        <Row
          label="Fees"
          value={`Taker: ${fmtPct(p?.taker_fee_rate) || "0%"} | Maker: ${fmtPct(p?.maker_fee_rate) || "0%"}`}
        />
      </div>

    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ltr-form__field">
      <label className="ltr-form__label">{label}</label>
      {children}
    </div>
  );
}

export function CoinSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="ltr-form__coin-wrap" ref={wrapRef}>
      <button
        className="ltr-form__trailing"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span>{value}</span>
        <Caret />
      </button>
      {open && (
        <div className="ltr-form__coin-menu">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="ltr-form__coin-item"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              <span>{opt}</span>
              {opt === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitSelect({ unit }: { unit: string }) {
  return (
    <button className="ltr-form__trailing" type="button">
      <span>{unit}</span>
      <Caret />
    </button>
  );
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
    </svg>
  );
}

export function Row({
  label,
  value,
  valueLink,
}: {
  label: string;
  value: React.ReactNode;
  valueLink?: boolean;
}) {
  return (
    <div className="ltr-form__row">
      <p className="ltr-form__row-label">{label}</p>
      <span className={valueLink ? "ltr-form__row-link" : "ltr-form__row-value"}>{value}</span>
    </div>
  );
}
