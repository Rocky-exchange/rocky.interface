import cx from "classnames";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import NestedTab from "./NestedTab";
import RegularTab from "./RegularTab";
import { isNestedOption, Option, BaseOptionValue, RegularOption } from "./types";

import "./Tabs.css";

type Props<V extends BaseOptionValue> = {
  options: Option<V>[];
  selectedValue: V | undefined;
  onChange?: (value: V) => void;
  size?: "l" | "m";
  type?: "inline" | "block" | "inline-primary";
  className?: string;
  regularOptionClassname?: string;
  qa?: string;
  rightContent?: ReactNode;
  /** 是否使用统一样式（自动应用 trade-direction-tab--active 类名和隐藏下划线） */
  useUnifiedStyle?: boolean;
};

export default function Tabs<V extends string | number>({
  options,
  selectedValue,
  onChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size = "m",
  type = "block",
  className,
  regularOptionClassname,
  qa,
  rightContent,
  useUnifiedStyle = false,
}: Props<V>) {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [underlineStyle, setUnderlineStyle] = useState<{ left: number; width: number } | null>(null);

  // 自动为统一样式的 tabs 添加 active className
  const processedOptions = useMemo(() => {
    if (useUnifiedStyle) {
      return options.map((opt) => {
        if (isNestedOption(opt)) {
          return opt;
        }
        const regularOpt = opt as RegularOption<V>;
        return {
          ...regularOpt,
          className: {
            ...regularOpt.className,
            active: "trade-direction-tab--active",
          },
        };
      });
    }
    return options;
  }, [options, useUnifiedStyle]);

  const updateUnderlinePosition = useCallback(() => {
    if (type !== "block" || !tabsContainerRef.current || selectedValue === undefined) {
      return;
    }

    const container = tabsContainerRef.current;
    const activeTab = container.querySelector(`[data-tab-value="${selectedValue}"]`) as HTMLElement;

    if (activeTab) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const left = tabRect.left - containerRect.left;
      const width = tabRect.width;

      setUnderlineStyle({ left, width });
    }
  }, [selectedValue, type]);

  useEffect(() => {
    updateUnderlinePosition();

    // 监听窗口大小改变，重新计算下划线位置
    if (type === "block") {
      window.addEventListener("resize", updateUnderlinePosition);
      return () => {
        window.removeEventListener("resize", updateUnderlinePosition);
      };
    }
  }, [updateUnderlinePosition, type]);

  return (
    <div
      ref={tabsContainerRef}
      data-qa={qa}
      data-unified-style={useUnifiedStyle || undefined}
      className={cx(
        "relative flex items-center justify-between",
        {
          "rounded-t-8": type === "block",
        },
        className
      )}
    >
      <div
        className={cx("flex w-full", {
          "gap-8": type === "inline" || type === "inline-primary",
        })}
      >
        {processedOptions.map((opt) =>
          isNestedOption(opt) ? (
            <NestedTab
              key={opt.label?.toString()}
              option={opt}
              selectedValue={selectedValue}
              onOptionClick={onChange}
            />
          ) : (
            <RegularTab
              key={opt.value}
              option={opt}
              selectedValue={selectedValue}
              onOptionClick={onChange}
              regularOptionClassname={regularOptionClassname}
              type={type}
              dataTabValue={opt.value}
            />
          )
        )}
      </div>

      {/* 下划线动画元素 - 仅用于 block 类型，统一样式的 tabs 不需要下划线 */}
      {type === "block" && underlineStyle && !useUnifiedStyle && (
        <div
          className="tab-underline-indicator"
          style={{
            left: `${underlineStyle.left}px`,
            width: `${underlineStyle.width}px`,
          }}
        />
      )}

      {rightContent}
    </div>
  );
}
