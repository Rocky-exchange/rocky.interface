type DisconnectAsync = () => Promise<void>;

export async function disconnectWalletSafely({
  disconnectAsync,
}: {
  config?: unknown;
  disconnectAsync?: DisconnectAsync;
  connector?: unknown;
}) {
  if (disconnectAsync) {
    await disconnectAsync().catch(() => undefined);
  }
}
