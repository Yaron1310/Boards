
import React from 'react';
import Header from './components/Header';
import Settings from './components/Settings';
import UsersLog from './components/UsersLog';

const App: React.FC = () => {
    // This assumes gymindPluginData is available on the window object, passed from WordPress
    const page = (window as any).gymindPluginData?.page ?? 'gymind-integration-settings';

    const renderPage = () => {
        switch (page) {
            case 'gymind-integration-users':
                return <UsersLog />;
            case 'gymind-integration-settings':
            default:
                return <Settings />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-dark text-gray-extralight font-sans">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
                {renderPage()}
            </main>
        </div>
    );
};

export default App;
