/**
 * Perp markets are margined/settled internally in USDC, but the product surface
 * displays the funding asset as **USDA** (see the USDCx→USDA migration). This
 * maps a raw market quote to its display label so no "USDC" pair ever renders.
 * Non-USDC quotes pass through unchanged.
 */
export function perpDisplayQuote(quote?: string | null): string {
  const q = (quote ?? "").trim().toUpperCase();
  if (q === "" || q === "USDC" || q === "USDCX") return "USDA";
  return String(quote);
}
