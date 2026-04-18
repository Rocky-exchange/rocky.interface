import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] DSN not configured, Sentry monitoring is disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,

    // Performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session replay for crash debugging
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Filter out non-critical errors and enhance error details
    beforeSend(event, hint) {
      const error = hint.originalException;

      // Handle plain objects (e.g., { code, message } from API errors)
      if (error && typeof error === "object" && !(error instanceof Error)) {
        const errorObj = error as Record<string, unknown>;
        const code = errorObj.code;
        const message = errorObj.message || errorObj.error || errorObj.reason;

        // Check for user rejection in plain objects
        if (typeof message === "string") {
          const lowerMessage = message.toLowerCase();
          if (
            lowerMessage.includes("user rejected") ||
            lowerMessage.includes("user denied") ||
            lowerMessage.includes("user cancelled") ||
            code === 4001 || // MetaMask user rejection code
            code === "ACTION_REJECTED"
          ) {
            return null;
          }
        }

        // Enhance the event with error details
        event.extra = {
          ...event.extra,
          errorCode: code,
          errorMessage: message,
          errorDetails: JSON.stringify(error, null, 2),
        };

        // Create a more descriptive message
        if (event.exception?.values?.[0]) {
          const errorValue = event.exception.values[0];
          if (message) {
            errorValue.value = `[${code || "Error"}] ${message}`;
          }
          if (!errorValue.type || errorValue.type === "UnhandledRejection") {
            errorValue.type = code ? `Error_${code}` : "UnhandledRejection";
          }
        }
      }

      // Ignore user-rejected wallet transactions (Error objects)
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes("user rejected") ||
          message.includes("user denied") ||
          message.includes("user cancelled")
        ) {
          return null;
        }
      }

      return event;
    },
  });
}

export { Sentry };
