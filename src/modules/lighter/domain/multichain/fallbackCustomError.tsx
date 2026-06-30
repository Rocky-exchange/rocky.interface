import { extendError, getCustomError, type OrderErrorContext } from "lib/errors";

export async function fallbackCustomError<T = void>(f: () => Promise<T>, errorContext: OrderErrorContext) {
  try {
    return await f();
  } catch (error) {
    throw extendError(getCustomError(error), {
      errorContext,
    });
  }
}
