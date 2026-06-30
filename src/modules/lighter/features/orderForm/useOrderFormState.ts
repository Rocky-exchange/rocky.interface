// src/modules/lighter/features/orderForm/useOrderFormState.ts
import { Dispatch, SetStateAction, useMemo, useState } from "react";

import { Mode, Side, MarginTab, SizeUnit, OrderFormSnapshot, OrderFormValidationError } from "./types";
import { validateAll } from "./validators";

export type UseOrderFormStateArgs = {
  defaultMode?: Mode;
  defaultLeverage?: number;
  maxLeverage: number;
};

export type UseOrderFormStateReturn = {
  // raw state
  mode: Mode;
  side: Side;
  leverageValue: number;
  pendingLeverageValue: number;
  pendingLeverageInput: string;
  marginTab: MarginTab;
  pendingMarginTab: MarginTab;
  advancedOpen: boolean;
  leverageModalOpen: boolean;
  marginModalOpen: boolean;
  size: string;
  sizeUnit: SizeUnit;
  price: string;
  tp: string;
  sl: string;

  // setters — typed as full React dispatch to allow functional updater form
  setMode: Dispatch<SetStateAction<Mode>>;
  setSide: Dispatch<SetStateAction<Side>>;
  setLeverageValue: Dispatch<SetStateAction<number>>;
  setPendingLeverageValue: Dispatch<SetStateAction<number>>;
  setPendingLeverageInput: Dispatch<SetStateAction<string>>;
  setMarginTab: Dispatch<SetStateAction<MarginTab>>;
  setPendingMarginTab: Dispatch<SetStateAction<MarginTab>>;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  setLeverageModalOpen: Dispatch<SetStateAction<boolean>>;
  setMarginModalOpen: Dispatch<SetStateAction<boolean>>;
  setSize: Dispatch<SetStateAction<string>>;
  setSizeUnit: Dispatch<SetStateAction<SizeUnit>>;
  setPrice: Dispatch<SetStateAction<string>>;
  setTp: Dispatch<SetStateAction<string>>;
  setSl: Dispatch<SetStateAction<string>>;

  // derived
  snapshot: OrderFormSnapshot;
  errors: OrderFormValidationError[];
  isValid: boolean;
};

export function useOrderFormState({
  defaultMode = "Market",
  defaultLeverage = 10,
  maxLeverage,
}: UseOrderFormStateArgs): UseOrderFormStateReturn {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [side, setSide] = useState<Side>("buy");
  const [leverageValue, setLeverageValue] = useState(defaultLeverage);
  const [pendingLeverageValue, setPendingLeverageValue] = useState(defaultLeverage);
  const [pendingLeverageInput, setPendingLeverageInput] = useState(String(defaultLeverage));
  const [marginTab, setMarginTab] = useState<MarginTab>("Cross");
  const [pendingMarginTab, setPendingMarginTab] = useState<MarginTab>("Cross");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [leverageModalOpen, setLeverageModalOpen] = useState(false);
  const [marginModalOpen, setMarginModalOpen] = useState(false);

  const [size, setSize] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("BASE");
  const [price, setPrice] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");

  const snapshot = useMemo<OrderFormSnapshot>(
    () => ({ mode, side, leverageValue, marginTab, size, sizeUnit, price, tp, sl }),
    [mode, side, leverageValue, marginTab, size, sizeUnit, price, tp, sl]
  );

  const errors = useMemo(() => validateAll(snapshot, maxLeverage), [snapshot, maxLeverage]);
  const isValid = errors.length === 0;

  return {
    mode,
    side,
    leverageValue,
    pendingLeverageValue,
    pendingLeverageInput,
    marginTab,
    pendingMarginTab,
    advancedOpen,
    leverageModalOpen,
    marginModalOpen,
    size,
    sizeUnit,
    price,
    tp,
    sl,
    setMode,
    setSide,
    setLeverageValue,
    setPendingLeverageValue,
    setPendingLeverageInput,
    setMarginTab,
    setPendingMarginTab,
    setAdvancedOpen,
    setLeverageModalOpen,
    setMarginModalOpen,
    setSize,
    setSizeUnit,
    setPrice,
    setTp,
    setSl,
    snapshot,
    errors,
    isValid,
  };
}
