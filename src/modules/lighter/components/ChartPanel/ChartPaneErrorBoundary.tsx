import { Component, ErrorInfo, ReactNode } from "react";
import { Trans } from "@lingui/macro";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Per-pane error boundary for split-chart layouts.
 *
 * Without this, any uncaught throw inside a TVChart instance (datafeed timeout,
 * unknown symbol, charting-library init crash) propagates up and unmounts the
 * entire ChartPanel — taking down the other panes plus the surrounding chrome
 * (timeframe bar, split menu, mode tabs). With per-pane isolation a single bad
 * pane degrades to a placeholder while the rest of the panel keeps working.
 */
export class ChartPaneErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ChartPaneErrorBoundary]", error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            color: "var(--color-typography-tertiary, #94a3b8)",
            fontSize: 12,
          }}
        >
          <Trans>Chart unavailable</Trans>
        </div>
      );
    }
    return this.props.children;
  }
}
