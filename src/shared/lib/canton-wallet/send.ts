import { SEND_INSTALL_URL, SEND_SIGNING_METHOD, SendProvider } from "@partylayer/adapter-send";

import type { ConnectedWallet, WalletProviderAdapter } from "./types";

const sendProvider = new SendProvider();

export type SendWalletHolding = {
  contract_id: string;
  instrument_id: {
    admin?: string;
    id: string;
  };
  total_unlocked_coin: string;
};

export async function connectSendWallet(): Promise<ConnectedWallet> {
  if (!(await sendProvider.isInstalled())) {
    throw new Error(`Send Wallet is not installed. Visit ${SEND_INSTALL_URL}`);
  }

  const status = await sendProvider.connect();
  const account = await sendProvider.getPrimaryAccount();
  if (!status.isConnected || !account.partyId) {
    throw new Error("Send Wallet did not return a connected Canton account");
  }

  const networkId = status.network?.networkId || account.networkId;
  return {
    connection: {
      provider: "send",
      partyId: account.partyId,
      walletAddress: account.partyId,
      alias: account.hint,
      displayName: account.hint,
      metadata: {
        source: "partylayer-send-adapter",
        publicKey: account.publicKey,
        namespace: account.namespace,
        networkId,
        signingProviderId: account.signingProviderId,
        signingMethod: SEND_SIGNING_METHOD,
      },
    },
    signMessage: async (message: string) => {
      const { signature } = await sendProvider.signMessage(message);
      return signature;
    },
  };
}

export const sendWalletAdapter: WalletProviderAdapter = {
  provider: "send",
  connect: connectSendWallet,
  async disconnect() {
    await sendProvider.disconnect();
  },
  async getPartyId() {
    try {
      return (await sendProvider.getPrimaryAccount()).partyId || null;
    } catch (_error) {
      return null;
    }
  },
  async getAddress() {
    return this.getPartyId();
  },
  async signMessage(message: string) {
    const { signature } = await sendProvider.signMessage(message);
    return signature;
  },
};

export async function fetchSendWalletHoldings(party: string): Promise<SendWalletHolding[]> {
  const ledgerEndResult = await sendProvider.ledgerApi({
    requestMethod: "get",
    resource: "/v2/state/ledger-end",
  });
  const ledgerEnd = JSON.parse(ledgerEndResult.response) as { offset?: unknown };
  if (ledgerEnd.offset === undefined || ledgerEnd.offset === null) {
    throw new Error("Send Wallet ledger API did not return a ledger-end offset");
  }

  const contractsResult = await sendProvider.ledgerApi({
    requestMethod: "post",
    resource: "/v2/state/active-contracts",
    body: {
      activeAtOffset: ledgerEnd.offset,
      eventFormat: {
        filtersByParty: {
          [party]: { cumulative: [] },
        },
        verbose: true,
      },
    },
  });
  const payload: unknown = JSON.parse(contractsResult.response);
  const createdEvents: Record<string, unknown>[] = [];
  collectCreatedEvents(payload, createdEvents);

  const holdings: SendWalletHolding[] = [];
  for (const event of createdEvents) {
    const contractId = cantonScalar(event.contractId);
    const interfaceViews = Array.isArray(event.interfaceViews) ? event.interfaceViews : [];
    for (const interfaceView of interfaceViews) {
      const view = asRecord(interfaceView);
      const viewValue = view ? asRecord(view.viewValue) : null;
      if (!viewValue) continue;

      const owner = cantonScalar(readCantonField(viewValue, "owner"));
      const amount = cantonScalar(readCantonField(viewValue, "amount"));
      const instrument = asRecord(readCantonField(viewValue, "instrumentId"));
      const lock = readCantonField(viewValue, "lock");
      if (!contractId || owner !== party || !amount || !instrument || lock != null) continue;

      const id = cantonScalar(readCantonField(instrument, "id"));
      const admin = cantonScalar(readCantonField(instrument, "admin"));
      if (!id) continue;
      holdings.push({
        contract_id: contractId,
        instrument_id: {
          ...(admin ? { admin } : {}),
          id,
        },
        total_unlocked_coin: amount,
      });
      break;
    }
  }
  return holdings;
}

function collectCreatedEvents(value: unknown, output: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCreatedEvents(item, output));
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  const createdEvent = asRecord(record.createdEvent);
  if (createdEvent) output.push(createdEvent);
  Object.values(record).forEach((item) => collectCreatedEvents(item, output));
}

function readCantonField(record: Record<string, unknown>, label: string): unknown {
  const fields = Array.isArray(record.fields)
    ? record.fields
    : Array.isArray(asRecord(record.record)?.fields)
      ? (asRecord(record.record)?.fields as unknown[])
      : null;
  if (fields) {
    const field = fields
      .map(asRecord)
      .find((item) => item?.label === label);
    if (field) return field.value;
  }
  return record[label];
}

function cantonScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["text", "party", "numeric", "contractId", "int64"]) {
    if (record[key] !== undefined && record[key] !== null) return String(record[key]);
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
