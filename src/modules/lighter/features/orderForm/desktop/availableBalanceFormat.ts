export function formatAvailableToTrade(
  previewAvailable: string | null | undefined,
  available: number | null | undefined,
): string {
  if (previewAvailable != null && previewAvailable !== "") {
    return `$${Number(previewAvailable).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (available != null && Number.isFinite(available)) {
    return `$${available.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return "0";
}
