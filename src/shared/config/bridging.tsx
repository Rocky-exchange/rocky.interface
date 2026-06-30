type BridgingOption = {
  name: string;
  render?: () => JSX.Element;
  generateLink?: (chainId: number) => string;
};

const BRIDGING_OPTIONS: { [symbol: string]: BridgingOption[] } = {};

export function getBridgingOptionsForToken(tokenSymbol?: string): BridgingOption[] | undefined {
  if (!tokenSymbol) return;
  return BRIDGING_OPTIONS[tokenSymbol];
}
