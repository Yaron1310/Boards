
import React, { useState, useEffect, useMemo } from 'react';
import { fetchProvisionLogs } from '../services/api';
import type { ProvisionLog } from '../types';
import { SpinnerIcon, CheckIcon, SearchIcon } from './icons';

const UsersLog: React.FC = () => {
    const [logs, setLogs] = useState<ProvisionLog[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedOrganization, setSelectedOrganization] = useState('');

    useEffect(() => {
        const loadLogs = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const fetchedLogs = await fetchProvisionLogs();
                setLogs(fetchedLogs);
            } catch (err: any) {
                setError(err.message || 'An unknown error occurred.');
                console.error("Failed to load provision logs:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadLogs();
    }, []);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    }

    const uniqueProducts = useMemo(() => {
        if (!logs) return [];
        return [...new Set(logs.map(log => log.product_name).filter(Boolean))].sort();
    }, [logs]);

    const uniqueOrganizations = useMemo(() => {
        if (!logs) return [];
        return [...new Set(logs.map(log => log.organization_name).filter(name => name && name !== 'N/A'))].sort();
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (selectedProduct && log.product_name !== selectedProduct) {
                return false;
            }
            if (selectedOrganization && log.organization_name !== selectedOrganization) {
                return false;
            }
            if (searchTerm) {
                const lowerTerm = searchTerm.toLowerCase();
                const searchCorpus = [
                    String(log.order_id),
                    log.customer_name,
                    log.customer_email,
                    log.product_name,
                    log.organization_name,
                    log.status,
                    formatDate(log.created_at)
                ].join(' ').toLowerCase();

                return searchCorpus.includes(lowerTerm);
            }
            return true;
        });
    }, [logs, searchTerm, selectedProduct, selectedOrganization]);

    const renderStatusIcon = (log: ProvisionLog) => {
        const title = log.response_message || log.status.charAt(0).toUpperCase() + log.status.slice(1);

        switch (log.status) {
            case 'success':
                return <CheckIcon className="w-5 h-5 text-green-400" title={title} />;
            case 'failed':
                 return (
                    <div className="w-5 h-5 flex items-center justify-center" title={title}>
                        <span className="text-red-400 font-bold text-lg">!</span>
                    </div>
                );
            default:
                return null;
        }
    };


    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-white text-xl flex items-center">
                    <SpinnerIcon className="w-6 h-6 mr-3"/>
                    Loading User Logs...
                </div>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline ml-2">{error}</span>
            </div>
        );
    }

    const inputClasses = "bg-gray-dark border border-gray-600 text-white sm:text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-full p-2.5";

    return (
        <section className="bg-gray-medium/50 p-6 rounded-lg border border-gray-700 shadow-lg">
            <h2 className="text-lg font-semibold text-white mb-4">User Provisioning Log</h2>
            <p className="text-sm text-gray-light mb-6">This log shows the last 100 provisioning attempts for products mapped in your settings from completed WooCommerce orders. Hover over a status icon for details.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-1">
                    <label htmlFor="log-search" className="sr-only">Search Logs</label>
                    <div className="relative">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-5 w-5 text-gray-light" />
                        </div>
                        <input
                            type="text"
                            id="log-search"
                            placeholder="Search logs..."
                            className={`${inputClasses} pl-10`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Search logs"
                        />
                    </div>
                </div>
                <div className="md:col-span-1">
                     <label htmlFor="product-filter" className="sr-only">Filter by product</label>
                     <select 
                        id="product-filter"
                        className={inputClasses}
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                        aria-label="Filter by product"
                     >
                        <option value="">All Products</option>
                        {uniqueProducts.map(product => (
                            <option key={product} value={product}>{product}</option>
                        ))}
                     </select>
                </div>
                <div className="md:col-span-1">
                    <label htmlFor="organization-filter" className="sr-only">Filter by organization</label>
                    <select
                        id="organization-filter"
                        className={inputClasses}
                        value={selectedOrganization}
                        onChange={(e) => setSelectedOrganization(e.target.value)}
                        aria-label="Filter by organization"
                    >
                        <option value="">All Organizations</option>
                        {uniqueOrganizations.map(org => (
                            <option key={org} value={org}>{org}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-full">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-600 font-semibold text-gray-light text-sm">
                        <div className="col-span-3">Date</div>
                        <div className="col-span-3">Customer</div>
                        <div className="col-span-3">Product</div>
                        <div className="col-span-2">Organization</div>
                        <div className="col-span-1 text-center">Status</div>
                    </div>
                    {/* Table Body */}
                    <div className="space-y-1 mt-1">
                        {filteredLogs.length > 0 ? (
                            filteredLogs.map((log) => (
                                <div key={log.id} className="grid grid-cols-12 gap-4 items-center bg-gray-medium p-3 rounded-lg text-sm text-gray-extralight hover:bg-gray-medium/70">
                                    <div className="col-span-3 truncate" title={formatDate(log.created_at)}>{formatDate(log.created_at)}</div>
                                    <div className="col-span-3 truncate">
                                        <div className="font-medium" title={log.customer_name}>{log.customer_name}</div>
                                        <div className="text-xs text-gray-light" title={log.customer_email}>{log.customer_email}</div>
                                    </div>
                                    <div className="col-span-3 truncate" title={log.product_name}>{log.product_name}</div>
                                    <div className="col-span-2 truncate" title={log.organization_name}>{log.organization_name}</div>
                                    <div className="col-span-1 flex justify-center">
                                        {renderStatusIcon(log)}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-gray-light">
                                {logs.length > 0 ? 'No logs match the current filters.' : 'No user provisioning logs found.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default UsersLog;
