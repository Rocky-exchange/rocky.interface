// src/shared/lib/useSafeAreaInsets.ts
import { useEffect, useState } from "react";

export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

/**
 * 读取 env(safe-area-inset-*) 的运行时值。
 * 需要 index.html viewport-fit=cover。
 */
export function useSafeAreaInsets(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    const compute = () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const read = (name: string) => parseFloat(cs.getPropertyValue(name) || "0") || 0;
      setInsets({
        top: read("--sai-top"),
        right: read("--sai-right"),
        bottom: read("--sai-bottom"),
        left: read("--sai-left"),
      });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return insets;
}
