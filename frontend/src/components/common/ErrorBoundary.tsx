import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import i18n from '../../i18n';
import { isChunkLoadError } from '../../utils/lazyWithRetry';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Translations are read imperatively because this is a class component and cannot use
// hooks. i18n loads its catalogs over HTTP, so a defaultValue is always supplied — if the
// boundary trips before (or instead of) the catalog arriving, the user still sees English
// rather than a raw translation key.
const t = (key: string, defaultValue: string): string => i18n.t(key, { defaultValue });

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

  // Reloads the current URL so the browser fetches a fresh index.html — and with it the
  // current chunk filenames. Only ever called from an explicit user click, never
  // automatically, so it cannot discard unsaved work behind the user's back.
  handleReloadCurrentPage = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A stale-deploy chunk failure is not an application bug and is not recoverable by
    // any client-side navigation — React.lazy caches the rejection for the life of the
    // document. Give it a dedicated, honest screen whose only action actually works.
    if (isChunkLoadError(error)) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50 px-4" role="alert">
          <div className="max-w-sm text-center">
            <FiRefreshCw size={32} className="text-indigo-600 mx-auto mb-3" aria-hidden="true" />
            <h1 className="text-base font-semibold text-gray-800 mb-1">
              {t('errorBoundary.updateAvailableTitle', 'A new version is available')}
            </h1>
            <p className="text-sm text-gray-500 mb-5">
              {t(
                'errorBoundary.updateAvailableMessage',
                'Boards was updated while this tab was open. Reload to continue — any work you have already saved is safe.',
              )}
            </p>
            <button
              type="button"
              onClick={this.handleReloadCurrentPage}
              aria-label={t('errorBoundary.reloadPage', 'Reload page')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              {t('errorBoundary.reloadPage', 'Reload page')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 px-4" role="alert">
        <div className="max-w-sm text-center">
          <FiAlertTriangle size={32} className="text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-base font-semibold text-gray-800 mb-1">
            {t('errorBoundary.genericTitle', 'Something went wrong')}
          </h1>
          <p className="text-sm text-gray-500 mb-5">
            {t(
              'errorBoundary.genericMessage',
              'This page hit an unexpected error. You can go back to where you were, or return to the home page.',
            )}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleGoBack}
              aria-label={t('errorBoundary.goBack', 'Go back')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {t('errorBoundary.goBack', 'Go back')}
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              aria-label={t('errorBoundary.goHome', 'Go to home')}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              {t('errorBoundary.goHome', 'Go to home')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
