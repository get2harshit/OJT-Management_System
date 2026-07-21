import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, an uncaught render error anywhere below unmounts the whole
// tree with nothing left on screen (reports of a silent black screen on the
// allocation page had no console trail to debug from) — this turns that
// into a visible, logged, recoverable error instead.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error:', error, '\n', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-4">
            <p className="text-white text-lg font-medium">Something went wrong</p>
            <p className="text-gray-400 text-sm break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded bg-white text-black text-sm font-medium hover:bg-gray-200"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
