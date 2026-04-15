import React, { useCallback, useState, useEffect } from 'react';
import type { ProductMapping, WooProduct, GymindPlan } from '../types';
import { PlusIcon, SpinnerIcon } from './icons';
import ProductMappingRow from './ProductMappingRow';
import { fetchPlans } from '../services/api';

interface ProductMappingManagerProps {
    mappings: ProductMapping[];
    onMappingsChange: (mappings: ProductMapping[]) => void;
    apiKey: string;
    apiUrl: string;
    onSave: () => Promise<void>;
    onRemoveAndSave: (id: string) => Promise<void>;
}

const ProductMappingManager: React.FC<ProductMappingManagerProps> = ({ mappings, onMappingsChange, apiKey, apiUrl, onSave, onRemoveAndSave }) => {
    const [plans, setPlans] = useState<GymindPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState<boolean>(false);
    const [plansError, setPlansError] = useState<string | null>(null);
    const [editingMappingIds, setEditingMappingIds] = useState<Set<string>>(new Set());

    const addMapping = useCallback(() => {
        const newMapping: ProductMapping = {
            id: `map_${Date.now()}`,
            productId: '',
            productName: '',
            planId: '',
            planName: '',
        };
        onMappingsChange([...mappings, newMapping]);
        setEditingMappingIds(prev => {
            const newSet = new Set(prev);
            newSet.add(newMapping.id);
            return newSet;
        });
    }, [mappings, onMappingsChange]);

    const updateMapping = useCallback((id: string, updatedFields: Partial<ProductMapping>) => {
        const newMappings = mappings.map(m => m.id === id ? { ...m, ...updatedFields } : m);
        onMappingsChange(newMappings);
    }, [mappings, onMappingsChange]);

    const toggleEditMapping = useCallback((id: string) => {
        setEditingMappingIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const handleProductSelect = useCallback((mappingId: string, product: WooProduct) => {
        updateMapping(mappingId, { productId: product.id, productName: product.name });
    }, [updateMapping]);

    const handlePlanChange = useCallback((mappingId: string, planId: string, planName: string) => {
        updateMapping(mappingId, { planId, planName });
    }, [updateMapping]);

    useEffect(() => {
        const loadPlans = async () => {
            if (apiKey && apiUrl) {
                setPlansLoading(true);
                setPlansError(null);
                try {
                    const fetchedPlans = await fetchPlans(apiKey, apiUrl);
                    setPlans(fetchedPlans);
                } catch (error: any) {
                    console.error("Failed to load plans:", error);
                    setPlansError(error.message || "Could not load plans. Please check API settings and network connection.");
                    setPlans([]);
                } finally {
                    setPlansLoading(false);
                }
            } else {
                setPlans([]);
                setPlansError(null);
            }
        };

        loadPlans();
    }, [apiKey, apiUrl]);

    return (
        <section className="bg-gray-medium/50 p-6 rounded-lg border border-gray-700 shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Product Mapping</h2>
                <button
                    onClick={addMapping}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-brand-primary hover:bg-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-dark focus:ring-brand-primary"
                    aria-label="Add new product mapping"
                >
                    <PlusIcon className="w-5 h-5 mr-1" />
                    Add Mapping
                </button>
            </div>
            {plansLoading && (
                <div className="flex items-center justify-center p-4 text-gray-light mb-4">
                    <SpinnerIcon className="w-5 h-5 mr-2" />
                    <span>Loading Gymind plans...</span>
                </div>
            )}
            {plansError && (
                 <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md mb-4" role="alert">
                    <strong className="font-bold">Error fetching plans:</strong>
                    <span className="block sm:inline ml-2">{plansError}</span>
                </div>
            )}
            {!apiKey && !apiUrl && !plansError && (
                <div className="text-center py-4 text-gray-light">
                    Please configure your API Key and URL to load Gymind plans.
                </div>
            )}
            <div className="overflow-x-auto pb-[200px]">
                <div className="min-w-full inline-block align-middle">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-600 font-semibold text-gray-light min-w-[600px]">
                        <div className="col-span-5">WooCommerce Product</div>
                        <div className="col-span-5">Gymind Plan</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {/* Table Body */}
                    <div className="space-y-2 mt-2 min-h-[300px] min-w-[600px]">
                        {mappings.length > 0 ? (
                            mappings.map((mapping) => (
                                <ProductMappingRow
                                    key={mapping.id}
                                    mapping={mapping}
                                    onProductSelect={(product) => handleProductSelect(mapping.id, product)}
                                    onPlanChange={(planId, planName) => handlePlanChange(mapping.id, planId, planName)}
                                    onRemove={() => onRemoveAndSave(mapping.id)}
                                    plans={plans}
                                    plansLoading={plansLoading}
                                    isEditing={editingMappingIds.has(mapping.id)}
                                    onToggleEdit={() => toggleEditMapping(mapping.id)}
                                    onSave={onSave}
                                />
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-light">
                                {!apiKey ? 'Configure API settings first.' : 'No product mappings configured. Click "Add Mapping" to start.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ProductMappingManager;
