import { cleanup, render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "./usePolling";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Consumer({ request }: { request: () => Promise<number> }) {
  usePolling(request, 1000);
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePolling", () => {
  it("waits for the active request before scheduling the next poll", async () => {
    vi.useFakeTimers();
    const first = deferred<number>();
    const request = vi.fn(() => first.promise);

    render(<Consumer request={request} />);
    expect(request).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(1);
      await first.promise;
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(request).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
