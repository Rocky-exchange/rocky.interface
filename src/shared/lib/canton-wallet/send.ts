import {
  SEND_SIGNING_METHOD,
  SendNotInstalledError,
  SendProvider,
  type SendDisclosedContract,
} from "@partylayer/adapter-send";

import { getCantonFundingAsset, type CantonFundsAsset } from "./assets";
import type { ConnectedWallet, WalletProviderAdapter } from "./types";

const sendProvider = new SendProvider();
const SEND_CONNECT_INSTALL_URL =
  "https://chromewebstore.google.com/detail/send-connect/ldmohiccoioolenadmogclhoklmanpgi";
const TOKEN_HOLDING_INTERFACE_ID =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const TOKEN_TRANSFER_FACTORY_INTERFACE_ID =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory";
const TOKEN_STANDARD_API_BASE =
  "https://api.utilities.digitalasset.com/api/token-standard";
const DEPOSIT_REASON_METADATA_KEY =
  "splice.lfdecentralizedtrust.org/reason";

export type SendWalletHolding = {
  contract_id: string;
  instrument_id: {
    admin?: string;
    id: string;
  };
  total_unlocked_coin: string;
};

type SendTransferInput = {
  from: string;
  to: string;
  token: CantonFundsAsset;
  amount: string;
  memo: string;
  reasonMetadataKey?: string;
};

type SendTransferFactoryResponse = {
  factoryId?: string;
  transferKind?: string;
  disclosedContracts?: unknown[];
  choiceContext?: {
    choiceContextData?: {
      values?: Record<string, unknown>;
    };
    disclosedContracts?: unknown[];
  };
};

export async function connectSendWallet(): Promise<ConnectedWallet> {
  let status;
  try {
    status = await sendProvider.connect();
  } catch (error) {
    if (error instanceof SendNotInstalledError) {
      throw new Error(`Send Connect is not installed. Visit ${SEND_CONNECT_INSTALL_URL}`);
    }
    throw error;
  }

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
      displayName: "sendwallet",
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
  const ledgerEnd = asRecord(readLedgerApiPayload(ledgerEndResult));
  if (!ledgerEnd || ledgerEnd.offset === undefined || ledgerEnd.offset === null) {
    throw new Error("Send Wallet ledger API did not return a ledger-end offset");
  }

  const contractsResult = await sendProvider.ledgerApi({
    requestMethod: "post",
    resource: "/v2/state/active-contracts",
    body: {
      activeAtOffset: ledgerEnd.offset,
      filter: {
        filtersByParty: {
          [party]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: {
                      interfaceId: TOKEN_HOLDING_INTERFACE_ID,
                      includeInterfaceView: true,
                      includeCreatedEventBlob: false,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: false,
    },
  });
  const payload = readLedgerApiPayload(contractsResult);
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

export async function submitSendWalletTransfer(input: SendTransferInput) {
  const holdings = (await fetchSendWalletHoldings(input.from))
    .filter((holding) => sendHoldingMatchesToken(holding, input.token))
    .sort((left, right) => Number(right.total_unlocked_coin) - Number(left.total_unlocked_coin));
  const selectedHoldings: SendWalletHolding[] = [];
  let selectedAmount = 0;
  for (const holding of holdings) {
    selectedHoldings.push(holding);
    selectedAmount += Number(holding.total_unlocked_coin);
    if (selectedAmount >= Number(input.amount)) break;
  }
  if (selectedAmount < Number(input.amount) || selectedHoldings.length === 0) {
    throw new Error(
      `Send Wallet ${input.token} balance is insufficient: requested ${input.amount}, available ${selectedAmount}`,
    );
  }

  const instrument = selectedHoldings[0].instrument_id;
  const instrumentAdmin = instrument.admin;
  if (!instrumentAdmin || !instrument.id) {
    throw new Error(`Send Wallet ${input.token} holding is missing its Token Standard instrument`);
  }
  const requestedAt = new Date(Date.now() - 1000).toISOString();
  const executeBefore = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const inputHoldingCids = selectedHoldings.map((holding) => holding.contract_id);
  const reasonMetadataKey = input.reasonMetadataKey || DEPOSIT_REASON_METADATA_KEY;
  const choiceArguments = {
    expectedAdmin: instrumentAdmin,
    transfer: {
      sender: input.from,
      receiver: input.to,
      amount: input.amount,
      instrumentId: {
        admin: instrumentAdmin,
        id: instrument.id,
      },
      requestedAt,
      executeBefore,
      inputHoldingCids,
      meta: {
        values: {
          [reasonMetadataKey]: input.memo,
        },
      },
    },
    extraArgs: {
      context: { values: {} },
      meta: { values: {} },
    },
  };

  const factoryResponse = await fetch(
    `${TOKEN_STANDARD_API_BASE}/v0/registrars/${encodeURIComponent(instrumentAdmin)}/registry/transfer-instruction/v1/transfer-factory`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        choiceArguments,
        excludeDebugFields: true,
      }),
    },
  );
  const factoryText = await factoryResponse.text();
  const factory = parseJson(factoryText) as SendTransferFactoryResponse | null;
  if (!factoryResponse.ok) {
    throw new Error(
      `Send Wallet transfer factory failed (${factoryResponse.status}): ${factoryText || "empty response"}`,
    );
  }
  if (!factory?.factoryId) {
    throw new Error("Send Wallet transfer factory did not return a factory contract");
  }

  const choiceContextValues = factory.choiceContext?.choiceContextData?.values || {};
  const choiceArgument = vRecord([
    ["expectedAdmin", vParty(instrumentAdmin)],
    [
      "transfer",
      vRecord([
        ["sender", vParty(input.from)],
        ["receiver", vParty(input.to)],
        ["amount", vNumeric(input.amount)],
        [
          "instrumentId",
          vRecord([
            ["admin", vParty(instrumentAdmin)],
            ["id", vText(instrument.id)],
          ]),
        ],
        ["requestedAt", vTimestamp(requestedAt)],
        ["executeBefore", vTimestamp(executeBefore)],
        ["inputHoldingCids", vList(inputHoldingCids.map(vContractId))],
        [
          "meta",
          vRecord([
            [
              "values",
              vTextMap([
                {
                  key: reasonMetadataKey,
                  value: vText(input.memo),
                },
              ]),
            ],
          ]),
        ],
      ]),
    ],
    [
      "extraArgs",
      vRecord([
        [
          "context",
          vRecord([
            [
              "values",
              vTextMap(
                Object.entries(choiceContextValues).map(([key, value]) => ({
                  key,
                  value: scanValueToAnyValue(value),
                })),
              ),
            ],
          ]),
        ],
        ["meta", vRecord([["values", vTextMap([])]])],
      ]),
    ],
  ]);
  const commandId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `send-transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const disclosedContracts = (
    factory.disclosedContracts ||
    factory.choiceContext?.disclosedContracts ||
    []
  )
    .map(sanitizeDisclosedContract)
    .filter((contract): contract is SendDisclosedContract => contract !== null);
  const synchronizerId = disclosedContracts.find(
    (contract) => contract.synchronizerId,
  )?.synchronizerId;
  const submission = await sendProvider.prepareExecuteAndWait({
    commandId,
    commands: [
      {
        ExerciseCommand: {
          templateId: TOKEN_TRANSFER_FACTORY_INTERFACE_ID,
          contractId: factory.factoryId,
          choice: "TransferFactory_Transfer",
          choiceArgument,
        },
      },
    ],
    actAs: [input.from],
    readAs: [],
    disclosedContracts,
    ...(synchronizerId ? { synchronizerId } : {}),
  });
  const updateId = submission.tx?.payload?.updateId;
  if (!updateId) {
    throw new Error("Send Wallet did not return a completed transfer update");
  }
  return {
    status: submission.tx?.status || "executed",
    commandId: submission.tx?.commandId || commandId,
    updateId,
    transferKind: factory.transferKind || "direct",
  };
}

function readLedgerApiPayload(result: unknown): unknown {
  const record = asRecord(result);
  if (!record || !Object.prototype.hasOwnProperty.call(record, "response")) return result;
  return typeof record.response === "string" ? JSON.parse(record.response) : record.response;
}

function sendHoldingMatchesToken(
  holding: SendWalletHolding,
  token: CantonFundsAsset,
): boolean {
  const asset = getCantonFundingAsset(token);
  if (asset.instrumentAdmin && asset.instrumentId) {
    return (
      holding.instrument_id.admin === asset.instrumentAdmin &&
      holding.instrument_id.id.trim().toUpperCase() === asset.instrumentId.toUpperCase()
    );
  }
  const instrumentId = holding.instrument_id.id
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return instrumentId === "cc" || instrumentId === "amulet" || instrumentId === "cantoncoin";
}

function sanitizeDisclosedContract(value: unknown): SendDisclosedContract | null {
  const record = asRecord(value);
  if (!record || typeof record.createdEventBlob !== "string" || !record.createdEventBlob) {
    return null;
  }
  const contractId =
    typeof record.contractId === "string" && record.contractId
      ? record.contractId
      : undefined;
  const synchronizerIdValue = record.synchronizerId || record.domainId;
  const synchronizerId =
    typeof synchronizerIdValue === "string" && synchronizerIdValue
      ? synchronizerIdValue
      : undefined;
  return {
    ...(contractId ? { contractId } : {}),
    createdEventBlob: record.createdEventBlob,
    ...(synchronizerId ? { synchronizerId } : {}),
  };
}

function parseJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function vParty(value: string) {
  return { party: value };
}

function vText(value: string) {
  return { text: value };
}

function vNumeric(value: string) {
  return { numeric: value };
}

function vContractId(value: string) {
  return { contractId: value };
}

function vTimestamp(value: string) {
  return { timestamp: String(Math.floor(new Date(value).getTime() * 1000)) };
}

function vRecord(fields: Array<[string, unknown]>) {
  return {
    record: {
      fields: fields.map(([label, value]) => ({ label, value })),
    },
  };
}

function vList(elements: unknown[]) {
  return { list: { elements } };
}

function vTextMap(entries: Array<{ key: string; value: unknown }>) {
  return { textMap: { entries } };
}

function scanValueToAnyValue(value: unknown): unknown {
  if (typeof value === "string") {
    return { variant: { constructor: "AV_Text", value: vText(value) } };
  }
  const record = asRecord(value);
  if (record && typeof record.tag === "string") {
    const constructor = record.tag;
    const inner = record.value;
    if (constructor === "AV_ContractId") {
      return { variant: { constructor, value: vContractId(String(inner)) } };
    }
    if (constructor === "AV_Bool") {
      return { variant: { constructor, value: { bool: Boolean(inner) } } };
    }
    if (constructor === "AV_List") {
      const values = Array.isArray(inner) ? inner : [];
      return {
        variant: {
          constructor,
          value: vList(values.map(scanValueToAnyValue)),
        },
      };
    }
    return { variant: { constructor, value: vText(String(inner)) } };
  }
  return { variant: { constructor: "AV_Text", value: vText(String(value)) } };
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
