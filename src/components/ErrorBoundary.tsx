import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[WA-Sim] ErrorBoundary caught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex-1 h-full flex items-center justify-center bg-[#f0f2f5] dark:bg-[#111b21] p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-[#202c33] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-lg space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-[#111b21] dark:text-[#e9edef]">
                Chat Display Error Recovered
              </h3>
              <p className="text-[13px] text-[#667781] dark:text-[#8696a0] mt-1 break-words">
                {this.state.error?.message || 'An error occurred while rendering messages.'}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reload Chat
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
