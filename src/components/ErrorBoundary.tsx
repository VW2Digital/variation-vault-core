import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** When true, render nothing on error (useful for non-critical 3rd-party widgets). */
  silent?: boolean;
  /** Optional label shown in console for easier debugging. */
  name?: string;
  /** Custom fallback UI. Ignored when `silent` is true. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary.
 *
 * Use `silent` for isolated, non-critical widgets (chat, pixels, popups) so a
 * crash inside them does not blank the entire page. Use the default visible
 * fallback for route-level boundaries.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}] Caught error:`,
      error,
      errorInfo,
    );
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.silent) return null;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Ops! Algo deu errado
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Encontramos um problema inesperado nesta tela. Você pode tentar novamente
            ou recarregar a página.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={this.handleReset}>
              Tentar novamente
            </Button>
            <Button onClick={this.handleReload}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Recarregar
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-6 text-left text-xs bg-muted p-3 rounded overflow-auto max-h-40 text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
