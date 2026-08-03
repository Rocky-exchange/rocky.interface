export function abbreviateWalletAddress(value: string | undefined, max = 28): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  const edge = Math.max(4, Math.floor((max - 3) / 2));
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}
