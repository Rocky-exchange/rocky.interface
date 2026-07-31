import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const walletMocks = vi.hoisted(() => ({
  console: vi.fn(),
  loop: vi.fn(),
  rocky: vi.fn(),
  send: vi.fn(),
}));

vi.mock("./console", () => ({
  submitConsoleWalletTransaction: walletMocks.console,
}));
vi.mock("./loop", () => ({
  submitLoopWalletTransaction: walletMocks.loop,
}));
vi.mock("./rocky", () => ({
  signRockyPreparedTransactionHash: walletMocks.rocky,
}));
vi.mock("./send", () => ({
  submitSendWalletTransaction: walletMocks.send,
}));
vi.mock("./session", () => ({
  exchangeSessionHeaders: () => ({ Authorization: "Bearer exchange-session" }),
}));

import { clearSpotMemberAuthCache, ensureSpotMemberAuth } from "./memberAuth";

const PARTY = "rockywallet-user::1220party";

describe("spot MemberAuth onboarding", () => {
  beforeEach(() => {
    clearSpotMemberAuthCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips wallet interaction when MemberAuth already exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        authorized: true,
        partyId: PARTY,
        memberAuthContractId: "member-auth-1",
        proposalContractId: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await ensureSpotMemberAuth({ provider: "send", party: PARTY });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(walletMocks.send).not.toHaveBeenCalled();
  });

  it("prepares and signs Rocky MemberAuth before the first spot order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(memberAuthState(false)))
      .mockResolvedValueOnce(
        jsonResponse({
          ...memberAuthState(false),
          proposalContractId: "proposal-1",
          transaction: {
            commandId: "member-auth-accept",
            commands: [],
            actAs: [PARTY],
            readAs: [],
            disclosedContracts: [],
            synchronizerId: "global-domain::1220sync",
            packageIdSelectionPreference: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          commandId: "member-auth-accept",
          preparedTransactionHash: "12".repeat(32),
          hashingSchemeVersion: "V2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...memberAuthState(true),
          memberAuthContractId: "member-auth-1",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(memberAuthState(true)));
    vi.stubGlobal("fetch", fetchMock);
    walletMocks.rocky.mockResolvedValue("ab".repeat(64));

    await ensureSpotMemberAuth({ provider: "rocky", party: PARTY });

    expect(walletMocks.rocky).toHaveBeenCalledWith("12".repeat(32), PARTY);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/v1/spot-chain/member-auth",
      "/v1/spot-chain/member-auth/proposal",
      "/v1/spot-chain/member-auth/prepare",
      "/v1/spot-chain/member-auth/execute",
      "/v1/spot-chain/member-auth",
    ]);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ signature: "ab".repeat(64) }),
    });
  });
});

function memberAuthState(authorized: boolean) {
  return {
    authorized,
    partyId: PARTY,
    memberAuthContractId: null,
    proposalContractId: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
