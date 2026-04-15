import React, { useState } from 'react';
import type { ProductMapping, WooProduct, GymindPlan } from '../types';
import ProductSearch from './ProductSearch';
import ConfirmationModal from './ConfirmationModal';
import { TrashIcon, EditIcon, SpinnerIcon } from './icons';

interface ProductMappingRowProps {
    mapping: ProductMapping;
    onProductSelect: (product: WooProduct) => void;
    onPlanChange: (planId: string, planName: string) => void;
    onRemove: () => Promise<void>;
    plans: GymindPlan[];
    plansLoading: boolean;
    isEditing: boolean;
    onToggleEdit: () => void;
    onSave: () => Promise<void>;
}

const ProductMappingRow: React.FC<ProductMappingRowProps> = ({
    mapping,
    onProductSelect,
    onPlanChange,
    onRemove,
    plans,
    plansLoading,
    isEditing,
    onToggleEdit,
    onSave,
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        const selectedPlan = plans.find(p => p.id === selectedId);
        onPlanChange(selectedId, selectedPlan ? selectedPlan.name : '');
    };

    const isComplete = !!(mapping.productId && mapping.planId);

    const handleConfirmAndSave = async () => {
        if (!isComplete || isSaving) return;

        setIsSaving(true);
        try {
            await onSave();
            onToggleEdit();
        } catch (error) {
            console.error("Save failed from row:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await onRemove();
        } catch (error) {
            console.error("Delete failed from row:", error);
            setIsDeleting(false);
            setIsDeleteModalOpen(false);
        }
    };

    if (!isEditing) {
        return (
             <div className="grid grid-cols-12 gap-4 items-center bg-gray-medium p-2 rounded-lg hover:bg-gray-medium/70 transition-colors duration-150">
                <div className="col-span-5 min-w-0 font-medium text-white truncate p-2.5" title={mapping.productName || 'No product selected'}>
                    {mapping.productName || <span className="text-gray-light italic">No product selected</span>}
                </div>
                <div className="col-span-5 min-w-0 text-white truncate p-2.5" title={mapping.planName || 'No plan selected'}>
                    {mapping.planName || <span className="text-gray-light italic">No plan selected</span>}
                </div>
                <div className="col-span-2 flex justify-end items-center gap-1">
                     <button
                        onClick={onToggleEdit}
                        className="p-2 text-gray-light hover:text-brand-primary rounded-md transition-colors duration-150"
                        aria-label="Edit mapping"
                    >
                        <EditIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="p-2 text-gray-light hover:text-red-500 rounded-md transition-colors duration-150"
                        aria-label="Remove mapping"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={handleConfirmDelete}
                    title="Delete Mapping"
                    message="Are you sure you want to delete this product mapping? This action is permanent and will be saved immediately."
                    isConfirming={isDeleting}
                />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-12 gap-4 items-center bg-gray-medium/70 p-2 rounded-lg ring-2 ring-brand-primary/50">
            <div className="col-span-5 min-w-0">
                <ProductSearch
                    onProductSelect={onProductSelect}
                    initialProductName={mapping.productName}
                />
            </div>
            <div className="col-span-5 min-w-0">
                <select
                    value={mapping.planId}
                    onChange={handleSelectChange}
                    disabled={plansLoading || !plans.length}
                    className="bg-gray-dark border border-gray-600 text-white sm:text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-full p-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Select a Gymind Plan"
                >
                    <option value="">
                        {plansLoading
                            ? 'Loading plans...'
                            : plans.length > 0
                            ? '-- Select a Plan --'
                            : 'No plans available'}
                    </option>
                    {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                            {plan.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="col-span-2 flex justify-end items-center gap-2">
                 <button
                    onClick={handleConfirmAndSave}
                    disabled={!isComplete || isSaving}
                    className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-medium focus:ring-brand-primary bg-brand-primary hover:bg-brand-secondary disabled:bg-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label="Save mapping"
                    title={isSaving ? "Saving..." : isComplete ? "Save mapping details" : "Please select a product and a plan"}
                >
                    {isSaving ? (
                        <>
                            <SpinnerIcon className="w-4 h-4 mr-1.5" />
                            <span>Saving...</span>
                        </>
                    ) : (
                        <span>Save</span>
                    )}
                </button>
                <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    disabled={isDeleting}
                    className="p-2 text-gray-light hover:text-red-500 rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Remove mapping"
                >
                     {isDeleting ? <SpinnerIcon className="w-5 h-5" /> : <TrashIcon className="w-5 h-5" />}
                </button>
                 <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={handleConfirmDelete}
                    title="Delete Mapping"
                    message="Are you sure you want to delete this product mapping? This action is permanent and will be saved immediately."
                    isConfirming={isDeleting}
                />
            </div>
        </div>
    );
};

export default ProductMappingRow;
