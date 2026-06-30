import { useEffect, useState } from "react";

import styles from "./MiningBadge.module.scss";

type Badge = { id: string; amount: number };

type Listener = (b: Badge) => void;
const listeners = new Set<Listener>();

export function emitMiningBadge(amount: number) {
  const b: Badge = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, amount };
  listeners.forEach((fn) => fn(b));
}

export function MiningBadgeContainer() {
  const [items, setItems] = useState<Badge[]>([]);

  useEffect(() => {
    const fn: Listener = (b) => {
      setItems((prev) => [...prev, b]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== b.id));
      }, 1900);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className={styles.container}>
      {items.map((b) => (
        <div key={b.id} className={styles.badge}>
          <span className={styles.icon}>⛏</span>
          +{b.amount.toLocaleString()} ROCKY
        </div>
      ))}
    </div>
  );
}
