import { Component, ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ChartErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Keeping a console line here is fine — the UI also surfaces the error.
    // eslint-disable-next-line no-console
    console.error("Chart render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error" role="alert">
          Chart failed to render: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
