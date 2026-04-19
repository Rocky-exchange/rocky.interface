import { useMemo, useState } from "react";

import { CoinSelect, Row } from "./MarketOrderForm";
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

const MID_PRICE = 74328.3;

export function LimitOrderForm({ side, isConnected, leverage, marginMode }: Props) {
  const [price, setPrice] = useState("");
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
  const { available } = useAvailableBalanceAdapter();
  const market = useMarketInfoAdapter();
  const baseSymbol = market.symbol || "BTC";
  const amountUnitOptions = useMemo(() => [baseSymbol, "USD"], [baseSymbol]);
  const rawAmount = Number(amount) || 0;
  const priceNum = Number(price) || 0;
  const refPrice = priceNum || MID_PRICE;
  const amountNum = amountUnit === "USD" && refPrice > 0 ? rawAmount / refPrice : rawAmount;
  const preview = useOrderPreviewAdapter({
    side,
    orderType: "limit",
    amount: amountNum,
    leverage,
    marginMode,
    reduceOnly,
    price: priceNum,
  });
  const p = preview.data;
  const fmtUsd = (s?: string) =>
    s ? `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";
  const fmtPct = (s?: string) => (s ? `${(Number(s) * 100).toFixed(2)}%` : "-");

  const submit = () =>
    placeOrder({
      side,
      type: "limit",
      amount: amountNum,
      price: priceNum || undefined,
      leverage,
      marginMode,
      reduceOnly,
      tpPrice: tpsl && tpPrice ? Number(tpPrice) : undefined,
      slPrice: tpsl && slPrice ? Number(slPrice) : undefined,
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
        <div className="ltr-form__field">
          <label className="ltr-form__label">Limit Price</label>
          <input
            className="ltr-form__input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={MID_PRICE.toFixed(1)}
            inputMode="decimal"
          />
          <button
            type="button"
            className="ltr-form__trailing ltr-form__trailing--link"
            onClick={() => setPrice(MID_PRICE.toFixed(1))}
          >
            Mid
          </button>
        </div>

        <div className="ltr-form__field">
          <label className="ltr-form__label">Amount</label>
          <input
            className="ltr-form__input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              const typed = Number(e.target.value) || 0;
              const bal = p?.available_balance ? Number(p.available_balance) : available;
              if (bal != null && bal > 0 && refPrice > 0) {
                const usdValue = amountUnit === "USD" ? typed : typed * refPrice;
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
              if (next !== amountUnit && rawAmount > 0 && refPrice > 0) {
                const newVal = next === "USD" ? rawAmount * refPrice : rawAmount / refPrice;
                setAmount(newVal.toFixed(next === "USD" ? 2 : 5));
              }
              setAmountUnit(next);
            }}
          />
        </div>

        <PercentSlider
          value={pct}
          onChange={(next) => {
            setPct(next);
            const bal = p?.available_balance ? Number(p.available_balance) : available;
            const ref = priceNum || MID_PRICE;
            if (bal != null && ref > 0) {
              const newAmount =
                amountUnit === "USD" ? (bal * (next / 100)).toFixed(2) : ((bal * (next / 100)) / ref).toFixed(5);
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
            <div className="ltr-form__field">
              <label className="ltr-form__label">TP Price</label>
              <input
                className="ltr-form__input"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
              />
            </div>
            <div className="ltr-form__field">
              <label className="ltr-form__label">Gain</label>
              <input
                className="ltr-form__input"
                value={tpGain}
                onChange={(e) => setTpGain(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <button className="ltr-form__trailing" type="button">
                <span>%</span>
                <Caret />
              </button>
            </div>
            <div className="ltr-form__field">
              <label className="ltr-form__label">SL Price</label>
              <input
                className="ltr-form__input"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
              />
            </div>
            <div className="ltr-form__field">
              <label className="ltr-form__label">Loss</label>
              <input
                className="ltr-form__input"
                value={slLoss}
                onChange={(e) => setSlLoss(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <button className="ltr-form__trailing" type="button">
                <span>%</span>
                <Caret />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ltr-form__section">
        <Row label="Maximum Order Value" value={fmtUsd(p?.order_value)} />
        <Row label="Order Size" value={p?.order_size_symbol ?? "-"} />
        <Row label="Order Value" value={fmtUsd(p?.order_value)} />
        <Row label="Limit Price" value={price || MID_PRICE.toLocaleString()} />
        <Row label="Est. Liq. Price" value={p?.est_liq_price ? Number(p.est_liq_price).toLocaleString() : "-"} />
        <Row label="Position Margin" value={p?.position_margin_after ? fmtUsd(p.position_margin_after) : "$0.00"} />
        <Row
          label="Fees"
          value={`Taker: ${fmtPct(p?.taker_fee_rate) || "0%"} | Maker: ${fmtPct(p?.maker_fee_rate) || "0%"}`}
        />
      </div>

    </div>
  );
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
    </svg>
  );
}
