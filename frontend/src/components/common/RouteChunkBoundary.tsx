import React from 'react';
import { useLocation } from 'react-router-dom';
import { FiRefreshCw } from 'react-icons/fi';
import i18n from '../../i18n';
import { isChunkLoadError } from '../../utils/lazyWithRetry';

// See ErrorBoundary for why translations are read imperatively with a defaultValue.
const t = (key: string, defaultValue: string): string => i18n.t(key, { defaultValue });

interface Props {
  children: React.ReactNode;
  /** Changing this clears a caught error — see componentDidUpdate. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

/**
 * Route-level boundary for stale-deploy chunk failures.
 *
 * The app-level ErrorBoundary sits above every provider, so an error reaching it tears
 * down the entire tree — providers, layout and all — before the fallback renders. For a
 * stale chunk that is far more destruction than the situation warrants: the only thing
 * actually broken is the route the user just opened.
 *
 * Placing this boundary around the routed <Outlet> keeps MainLayout and every provider
 * mounted, so the failure is contained to the content area. The user keeps their session,
 * their sidebar, and any route whose chunk is already in memory — and can choose when to
 * reload rather than being forced into it.
 *
 * Only ChunkLoadError is handled here. Anything else is re-thrown so it still reaches the
 * app-level ErrorBoundary, which remains the correct place for genuine render bugs.
 */
class RouteChunkBoundaryInner extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      console.error('[RouteChunkBoundary] Stale chunk on route load:', error, info.componentStack);
    }
  }

  // Without this the boundary would latch: once it caught an error it would keep showing
  // the notice even after the user navigated somewhere whose chunk is perfectly loadable,
  // turning a contained failure back into a dead end.
  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Not a stale chunk — let the app-level boundary deal with it.
    if (!isChunkLoadError(error)) throw error;

    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] px-4" role="alert">
        <div className="max-w-sm text-center">
          <FiRefreshCw size={28} className="text-indigo-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            {t('errorBoundary.updateAvailableTitle', 'Boards has been updated')}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            {t(
              'errorBoundary.routeUpdateMessage',
              'This page needs the new version in order to open. Nothing has been changed or lost — you can carry on working and reload whenever you are ready.',
            )}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            aria-label={t('errorBoundary.reloadPage', 'Reload page')}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            {t('errorBoundary.reloadPage', 'Reload page')}
          </button>
        </div>
      </div>
    );
  }
}

/** Wrapper supplying the current path, so the boundary clears itself on navigation. */
const RouteChunkBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return <RouteChunkBoundaryInner resetKey={location.pathname}>{children}</RouteChunkBoundaryInner>;
};

export default RouteChunkBoundary;
