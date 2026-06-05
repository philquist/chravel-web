import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { safeReload } from '@/utils/safeReload';
import { telemetry } from '@/telemetry/service';
import { redactStackTrace } from '@/telemetry/privacy';
import { isChunkLoadError, recoverFromChunkError } from '@/utils/chunkRecovery';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Use compact mode for nested components (non-full-page errors) */
  compact?: boolean;
  /** Called when user clicks retry */
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }

    // Send error to telemetry service (PostHog $exception)
    telemetry.captureError(error, {
      context: 'ErrorBoundary',
      component_stack: redactStackTrace(errorInfo.componentStack),
      is_chunk_error: isChunkLoadError(error),
    });

    // Send error to monitoring service
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      });
    }

    // Auto-recover from chunk errors on new deployments — guarded to run at most
    // once per session so an un-clearable cache can't trigger a reload loop. If
    // recovery was already attempted, fall through to the visible fallback below.
    if (isChunkLoadError(error)) {
      void recoverFromChunkError();
    }
  }

  private handleReset = async () => {
    const shouldReload = isChunkLoadError(this.state.error);

    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();

    if (shouldReload) {
      await safeReload();
    }
  };

  private handleClearAndReload = async () => {
    // safeReload(true) clears caches + unregisters service workers before reloading.
    await safeReload(true);
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunk = isChunkLoadError(this.state.error);

      // Compact mode for nested components
      if (this.props.compact) {
        return (
          <div className="flex flex-col items-center justify-center p-6 space-y-4 bg-muted/30 rounded-lg">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div className="text-center space-y-1">
              <p className="font-medium text-foreground">
                {isChunk ? 'Failed to load content' : 'Something went wrong'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isChunk ? 'A new version may be available.' : 'Please try again.'}
              </p>
            </div>
            <div className="flex gap-2">
              {isChunk ? (
                <>
                  <button
                    onClick={this.handleReset}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                  <button
                    onClick={this.handleClearAndReload}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Reload
                  </button>
                </>
              ) : (
                <button
                  onClick={() => safeReload()}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              )}
            </div>
          </div>
        );
      }

      // Full page error (default)
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                {isChunk ? 'Failed to Load Page' : 'Something went wrong'}
              </h1>
              <p className="text-muted-foreground">
                {isChunk
                  ? 'This usually happens after an app update. Clear your cache to load the latest version.'
                  : "We're sorry, but something unexpected happened. Please try refreshing the page."}
              </p>
            </div>

            <div className="space-y-3">
              {isChunk ? (
                <>
                  <button
                    onClick={this.handleClearAndReload}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl transition-colors font-medium"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Cache & Reload
                  </button>
                  <button
                    onClick={this.handleReset}
                    className="w-full flex items-center justify-center gap-2 bg-muted text-muted-foreground hover:bg-muted/80 px-6 py-3 rounded-xl transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </button>
                </>
              ) : (
                <button
                  onClick={() => safeReload()}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl transition-colors font-medium"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Page
                </button>
              )}
            </div>

            {this.state.error && (
              <details className="text-left text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg mt-4">
                <summary className="cursor-pointer font-medium">Error Details</summary>
                <p className="mt-2 break-words">{this.state.error.message}</p>
                {import.meta.env.DEV && (
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs opacity-70">
                    {this.state.error.stack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
