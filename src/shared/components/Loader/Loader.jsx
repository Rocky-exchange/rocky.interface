import { useEffect, useMemo, useRef } from "react";
import lottie from "lottie-web";

import animation01 from "./animations/01.json";
import animation02 from "./animations/02.json";
import animation03 from "./animations/03.json";

import "./Loader.css";

const ANIMATIONS = [animation01, animation02, animation03];

/**
 * Rocky 品牌加载动画：3 套 Lottie 资源，挂载时随机选一套播放。
 * 通过 `variant`（1|2|3）可强制指定具体动画。
 */
export default function Loader({ variant, size = 150, className = "" }) {
  const containerRef = useRef(null);

  const animationData = useMemo(() => {
    if (variant === 1 || variant === 2 || variant === 3) {
      return ANIMATIONS[variant - 1];
    }
    return ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
  }, [variant]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const instance = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData,
    });

    return () => {
      instance.destroy();
    };
  }, [animationData]);

  return (
    <div
      ref={containerRef}
      className={`rocky-loader ${className}`.trim()}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
