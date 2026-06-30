import { Helmet } from "react-helmet";
import { useLocation } from "react-router-dom";

import { PRODUCTION_HOST } from "config/links";

/**
 * 默认站点元信息使用固定英文文案，不经过 Lingui catalog。
 * 否则旧 .po / 未重新 compile 的 messages 仍可能把 og:title 等解析成历史文案，
 * 链接预览（Telegram、Discord、Slack 等）会读到错误品牌。
 */
const DEFAULT_SEO_TITLE = "Rocky | Decentralized Perpetual Exchange";
const DEFAULT_SEO_DESCRIPTION =
  "Rocky: Trade perpetual BTC, ETH and other top cryptocurrencies with up to 50x leverage directly from your wallet.";
const DEFAULT_SEO_KEYWORDS = "Rocky, Crypto Exchange, BTC Perpetuals, Bitcoin Trading, Perps DEX";

function SEO(props) {
  const { children, ...customMeta } = props;
  const { pathname, search } = useLocation();
  const origin = PRODUCTION_HOST.replace(/\/$/, "");
  const canonicalUrl = `${origin}${pathname}${search}`;

  const meta = {
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    keywords: DEFAULT_SEO_KEYWORDS,
    image: `${origin}/og.svg`,
    type: "exchange",
    ...customMeta,
  };
  return (
    <>
      <Helmet>
        <title>{meta.title}</title>
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="follow, index" />
        <meta content={meta.description} name="description" />
        <meta content={meta.keywords} name="keywords" />
        <meta property="og:type" content={meta.type} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Rocky" />
        <meta property="og:description" content={meta.description} />
        <meta property="og:title" content={meta.title} />
        <meta property="og:image" content={meta.image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@rocky" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.description} />
        <meta name="twitter:image" content={meta.image} />
      </Helmet>
      {children}
    </>
  );
}

export default SEO;
