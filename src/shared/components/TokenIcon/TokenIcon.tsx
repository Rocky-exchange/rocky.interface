import cx from "classnames";
import { useCallback, useMemo, useState } from "react";

import { CHAIN_ID_TO_NETWORK_ICON } from "config/icons";
import { tryImportImage } from "lib/legacy";

import "./TokenIcon.scss";

const loadedImageSources = new Set<string>();

function getIconUrlPath(symbol) {
  if (!symbol) return;

  return `ic_${symbol.toLowerCase()}.svg`;
}

function getIconSource(symbol: string): string | undefined {
  return tryImportImage(getIconUrlPath(symbol));
}

// Fallback component when icon is not found - displays first letter of symbol
function FallbackIcon({
  symbol,
  displaySize,
  className,
}: {
  symbol: string;
  displaySize: number;
  className?: string;
}) {
  const letter = symbol?.charAt(0)?.toUpperCase() || "?";
  const fontSize = Math.max(10, displaySize * 0.5);
  const style = useMemo(
    () => ({
      width: displaySize,
      height: displaySize,
      fontSize,
    }),
    [displaySize, fontSize]
  );

  return (
    <span
      className={cx(
        "Token-icon inline-flex items-center justify-center rounded-full bg-slate-600 text-white font-medium",
        className
      )}
      style={style}
      data-qa="token-icon-fallback"
    >
      {letter}
    </span>
  );
}

type Props = {
  symbol: string;
  displaySize: number;
  imageUrl?: string;
  loading?: boolean;
  className?: string;
  badge?: string | readonly [topSymbol: string, bottomSymbol: string];
  chainIdBadge?: number;
  badgeClassName?: string;
};

function TokenIcon({ className, symbol, displaySize, imageUrl, loading, badge, badgeClassName, chainIdBadge }: Props) {
  const [failedImageSource, setFailedImageSource] = useState<string>();
  const [loadedImageSource, setLoadedImageSource] = useState<string>();
  const iconPath = getIconUrlPath(symbol);
  const classNames = cx("Token-icon inline rounded-full", className);

  // Try to get the image, returns undefined if not found
  const inferredImageSrc = getIconSource(symbol);
  const preferredImageSrc = imageUrl || inferredImageSrc;
  const imageSrc =
    preferredImageSrc && preferredImageSrc !== failedImageSource
      ? preferredImageSrc
      : imageUrl && inferredImageSrc !== failedImageSource
        ? inferredImageSrc
        : undefined;
  const handleImageError = useCallback(() => {
    if (imageSrc) {
      loadedImageSources.delete(imageSrc);
      setFailedImageSource(imageSrc);
      setLoadedImageSource((loaded) => (loaded === imageSrc ? undefined : loaded));
    }
  }, [imageSrc]);
  const handleImageLoad = useCallback(() => {
    if (imageSrc) {
      loadedImageSources.add(imageSrc);
      setLoadedImageSource(imageSrc);
    }
  }, [imageSrc]);
  const imageLoaded = imageSrc ? loadedImageSources.has(imageSrc) || loadedImageSource === imageSrc : false;

  if (!iconPath && !imageUrl) return <></>;

  let sub;
  let containerClassName = "";

  if (badge) {
    if (typeof badge === "string") {
      sub = (
        <span
          className={cx(
            "pointer-events-none absolute -bottom-8 -right-8 z-10 rounded-20 bg-slate-700 px-6 py-2 text-12 font-medium text-typography-secondary",
            badgeClassName
          )}
        >
          {badge}
        </span>
      );
    } else {
      const badge0Path = getIconUrlPath(badge[0]);
      const badge1Path = getIconUrlPath(badge[1]);
      const badge0Src = badge0Path ? getIconSource(badge[0]) : undefined;
      const badge1Src = badge1Path ? getIconSource(badge[1]) : undefined;

      sub = (
        <span
          className={cx(
            "absolute -bottom-8 -right-8 flex flex-row items-center justify-center text-typography-secondary",
            badgeClassName
          )}
        >
          {badge0Src ? (
            <img
              className="z-20 -mr-10 rounded-[100%] border-2 border-slate-900 bg-slate-900"
              src={badge0Src}
              alt={badge[0]}
              width={20}
              height={20}
            />
          ) : (
            <FallbackIcon symbol={badge[0]} displaySize={20} className="z-20 -mr-10 border-2 border-slate-900" />
          )}
          {badge1Src ? (
            <img
              className="z-10 rounded-[100%] border-2 border-slate-900 bg-slate-900"
              src={badge1Src}
              alt={badge[1]}
              width={20}
              height={20}
            />
          ) : (
            <FallbackIcon symbol={badge[1]} displaySize={20} className="z-10 border-2 border-slate-900" />
          )}
        </span>
      );
    }
  } else if (chainIdBadge !== undefined) {
    let size: number;
    let offset: string;

    if (displaySize >= 40) {
      size = 16;
      offset = "-bottom-0 -right-4";
      containerClassName = "token-icon-with-badge-large";
    } else {
      size = 10;
      offset = "-bottom-2 -right-2";
      containerClassName = "token-icon-with-badge-small";
    }
    sub = (
      <img
        src={CHAIN_ID_TO_NETWORK_ICON[chainIdBadge]}
        width={size}
        height={size}
        className={cx("absolute  z-10 box-content rounded-full bg-slate-900", offset)}
      />
    );
  }

  // Use fallback if image not found
  const img = imageSrc ? (
    <img
      data-qa="token-icon"
      className={cx(sub ? containerClassName : classNames, !imageLoaded && "opacity-0")}
      src={imageSrc}
      alt={symbol}
      width={displaySize}
      height={displaySize}
      onLoad={handleImageLoad}
      onError={handleImageError}
    />
  ) : loading ? (
    <svg
      data-qa="token-icon-placeholder"
      className={sub ? containerClassName : classNames}
      width={displaySize}
      height={displaySize}
      aria-hidden="true"
      focusable="false"
    />
  ) : (
    <FallbackIcon symbol={symbol} displaySize={displaySize} className={sub ? containerClassName : classNames} />
  );

  if (!sub) {
    return img;
  }

  return (
    <span className={cx("relative", className)}>
      {img}
      {sub}
    </span>
  );
}

export default TokenIcon;
