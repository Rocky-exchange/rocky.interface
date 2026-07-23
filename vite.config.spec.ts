import type { ConfigEnv, UserConfig } from "vite";
import { describe, expect, it } from "vitest";

import configExport from "./vite.config";

async function resolveConfig(): Promise<UserConfig> {
  const factory = configExport as (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
  return factory({
    command: "serve",
    mode: "development",
    isSsrBuild: false,
    isPreview: false,
  });
}

describe("Vite development proxy", () => {
  it("caps the Rocky API upstream at TLS 1.2 for stable local proxying", async () => {
    const config = await resolveConfig();
    const spotProxy = config.server?.proxy?.["/api/v3"];
    const agent = typeof spotProxy === "object" ? spotProxy.agent : undefined;

    expect(typeof spotProxy).toBe("object");
    expect(agent).toBeDefined();
    expect((agent as { options?: { maxVersion?: string } }).options?.maxVersion).toBe("TLSv1.2");
    expect((agent as { options?: { keepAlive?: boolean } }).options?.keepAlive).toBe(true);
  });
});
