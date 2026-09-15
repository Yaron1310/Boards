
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App'; // Assuming App.tsx is in the same src/ directory
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext'; // Assuming contexts are in src/contexts/
import { DataProvider } from './contexts/DataContext';
import { FormulaRecordingProvider } from './contexts/FormulaRecordingContext';
// Inter, self-hosted. These are the five weights the UI uses: 400 body, 500/600/700 for
// Tailwind's font-medium/semibold/bold, and 900 for the landing hero. Latin subset only.
// Serving these ourselves keeps visitor IPs from reaching Google's CDN and takes a
// render-blocking third-party request off the critical path.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-900.css';
import './index.css'; // Import the global stylesheet
import './i18n'; // Initialize i18next before the app renders

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes — avoids refetching on quick tab switches
      gcTime: 10 * 60 * 1000,     // 10 minutes garbage collection
      refetchOnWindowFocus: true,  // Re-fetch stale data when the user returns to the tab
      retry: (failureCount, error: Error) => {
        // Don't retry on auth expiration
        if (error?.message?.includes('expired')) return false;
        return failureCount < 2;
      },
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DataProvider>
            <FormulaRecordingProvider>
              <App />
            </FormulaRecordingProvider>
          </DataProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);