import { Trans } from "@lingui/macro";
import { useCallback, useEffect } from "react";
import { useAccount } from "wagmi";

import { useZtdxAuth } from "@/modules/cex/lib/api";

import Button from "components/Button/Button";
import TooltipWithPortal from "components/Tooltip/TooltipWithPortal";

import "./ZtdxAuthButton.scss";

interface ZtdxAuthButtonProps {
  variant?: "primary" | "secondary" | "link";
  className?: string;
  showStatus?: boolean;
}

export function ZtdxAuthButton({
  variant = "secondary",
  className,
  showStatus = true,
}: ZtdxAuthButtonProps) {
  const { isConnected } = useAccount();
  const {
    isAuthenticated,
    isAuthenticating,
    error,
    authenticate,
    logout,
    clearError,
  } = useZtdxAuth();

  // Debug: Log authentication state changes (only important ones)
  useEffect(() => {
    // Only log when authentication state changes (not on every render)
    if (isAuthenticated !== undefined) {
      console.log("[ZtdxAuthButton] 🔐 Auth state:", isAuthenticated ? "✅ Authenticated" : "❌ Not authenticated", {
        isAuthenticating,
        hasError: !!error,
      });
    }
  }, [isAuthenticated]); // Only depend on isAuthenticated to reduce logs

  const handleClick = useCallback(async () => {
    if (isAuthenticated) {
      logout();
    } else {
      clearError();
      await authenticate();
    }
  }, [isAuthenticated, authenticate, logout, clearError]);

  // Don't show if wallet is not connected
  if (!isConnected) {
    return null;
  }

  const buttonText = isAuthenticating ? (
    <Trans>Signing...</Trans>
  ) : isAuthenticated ? (
    <Trans>Sign Out</Trans>
  ) : (
    <Trans>Sign In</Trans>
  );

  const statusIndicator = showStatus && (
    <span
      className={`ZtdxAuthButton-status ${isAuthenticated ? "ZtdxAuthButton-status--authenticated" : ""}`}
    />
  );

  return (
    <div className={`ZtdxAuthButton ${className || ""}`}>
      {error ? (
      <TooltipWithPortal
        handle={
          <Button
            variant={variant}
            className="ZtdxAuthButton-button"
            onClick={handleClick}
            disabled={isAuthenticating}
          >
            {statusIndicator}
            {buttonText}
          </Button>
        }
          disabled={false}
        isHandlerDisabled={false}
          shouldPreventDefault={false}
        renderContent={() => (
          <div className="ZtdxAuthButton-error">
            <Trans>Error: {error}</Trans>
          </div>
        )}
      />
      ) : (
        <Button
          variant={variant}
          className="ZtdxAuthButton-button"
          onClick={handleClick}
          disabled={isAuthenticating}
        >
          {statusIndicator}
          {buttonText}
        </Button>
      )}
    </div>
  );
}

export default ZtdxAuthButton;
