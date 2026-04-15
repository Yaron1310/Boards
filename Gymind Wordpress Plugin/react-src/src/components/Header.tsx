
import React from 'react';

const Header: React.FC = () => {
    const currentPage = (window as any).gymindPluginData?.page ?? 'gymind-integration-settings';
    const settingsUrl = 'admin.php?page=gymind-integration-settings';
    const usersUrl = 'admin.php?page=gymind-integration-users';
    const logoUrl = (window as any).gymindPluginData?.logoUrl;

    const getLinkClassName = (page: string) => {
        const baseClasses = 'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors';
        if (currentPage === page) {
            return `${baseClasses} text-white bg-gray-medium/50 border-b-2 border-brand-primary`;
        }
        return `${baseClasses} text-gray-light hover:text-white hover:bg-gray-medium/20`;
    };

    return (
        <header className="bg-gray-medium/30 border-b border-gray-700">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-3">
                        {logoUrl && <img src={logoUrl} alt="Gymind Logo" className="h-8 w-auto" />}
                        <h1 className="text-xl font-bold text-white">Gymind Integration</h1>
                    </div>
                    <nav className="flex space-x-2">
                        <a href={settingsUrl} className={getLinkClassName('gymind-integration-settings')}>
                            Settings
                        </a>
                        <a href={usersUrl} className={getLinkClassName('gymind-integration-users')}>
                            Users
                        </a>
                    </nav>
                </div>
            </div>
        </header>
    );
};

export default Header;
