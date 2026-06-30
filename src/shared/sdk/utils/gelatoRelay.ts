export const gelatoRelay = {
  onError: () => undefined,
  sponsoredCall: async () => {
    throw new Error("Gelato relay is disabled in the Canton runtime");
  },
  callWithSyncFee: async () => {
    throw new Error("Gelato relay is disabled in the Canton runtime");
  },
};
