import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Top-level safety net: without this, an uncaught render error anywhere in the
// tree unmounts the whole app to a blank white screen with no way to recover
// short of manually editing the URL. This catches it and offers a way back.
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleGoBack = () => {
    this.setState({ error: null });
    window.history.back();
  };

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50 px-4" role="alert">
          <div className="max-w-sm text-center">
            <FiAlertTriangle size={32} className="text-amber-500 mx-auto mb-3" aria-hidden="true" />
            <h1 className="text-base font-semibold text-gray-800 mb-1">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-5">
              This page hit an unexpected error. You can go back to where you were, or return to the home page.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.handleGoBack}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
