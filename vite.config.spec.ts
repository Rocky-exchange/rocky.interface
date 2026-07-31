import type { ConfigEnv, UserConfig } from "vite";
import { describe, expect, it, vi } from "vitest";

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
  it("forwards the same-origin activity API path instead of serving the SPA shell", async () => {
    const config = await resolveConfig();
    const activityProxy = config.server?.proxy?.["/external-active"];

    expect(activityProxy).toMatchObject({
      target: "https://app.rockytest.xyz",
      changeOrigin: true,
      secure: true,
    });
  });

  it("caps the Rocky API upstream at TLS 1.2 for stable local proxying", async () => {
    const config = await resolveConfig();
    const spotProxy = config.server?.proxy?.["/api/v3"];
    const agent = typeof spotProxy === "object" ? spotProxy.agent : undefined;

    expect(typeof spotProxy).toBe("object");
    expect(agent).toBeDefined();
    expect((agent as { options?: { maxVersion?: string } }).options?.maxVersion).toBe("TLSv1.2");
    expect((agent as { options?: { keepAlive?: boolean } }).options?.keepAlive).toBe(true);
  });

  it("does not forward the localhost Origin header to the activity backend", async () => {
    const config = await resolveConfig();
    const activityProxy = config.server?.proxy?.["/external-active"];
    const removeHeader = vi.fn();
    const proxy = {
      on: vi.fn((event: string, listener: (request: { removeHeader: (name: string) => void }) => void) => {
        if (event === "proxyReq") listener({ removeHeader });
      }),
    };

    expect(typeof activityProxy).toBe("object");
    if (typeof activityProxy === "object") {
      activityProxy.configure?.(proxy as never, {} as never);
    }

    expect(removeHeader).toHaveBeenCalledWith("origin");
  });
});

describe("Vite production chunks", () => {
  it("does not force chart and UI dependencies into mutually dependent chunks", async () => {
    const config = await resolveConfig();
    const output = config.build?.rollupOptions?.output;
    const manualChunks = !Array.isArray(output) ? output?.manualChunks : undefined;

    expect(manualChunks).toEqual({
      utilities: ["date-fns", "lodash"],
    });
  });
});
