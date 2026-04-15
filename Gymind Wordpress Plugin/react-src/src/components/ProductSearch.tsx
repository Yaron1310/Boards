
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { searchProducts } from '../services/api';
import type { WooProduct } from '../types';
import { SearchIcon, SpinnerIcon } from './icons';

interface ProductSearchProps {
    onProductSelect: (product: WooProduct) => void;
    initialProductName: string;
}

const ProductSearch: React.FC<ProductSearchProps> = ({ onProductSelect, initialProductName }) => {
    const [searchTerm, setSearchTerm] = useState(initialProductName);
    const [results, setResults] = useState<WooProduct[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const handleSearch = useCallback(async (query: string) => {
        if (query.length < 2) {
            setResults([]);
            return;
        }
        setIsLoading(true);
        const products = await searchProducts(query);
        setResults(products);
        setIsLoading(false);
        setIsDropdownOpen(true);
    }, []);

    useEffect(() => {
        // Debounce search
        if (searchTerm !== initialProductName) {
            const handler = setTimeout(() => {
                handleSearch(searchTerm);
            }, 500);

            return () => {
                clearTimeout(handler);
            };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, handleSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelectProduct = (product: WooProduct) => {
        setSearchTerm(product.name);
        onProductSelect(product);
        setIsDropdownOpen(false);
    };

    return (
        <div className="relative" ref={searchRef}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    {isLoading ? (
                        <SpinnerIcon className="w-4 h-4 text-gray-light" />
                    ) : (
                        <SearchIcon className="w-4 h-4 text-gray-light" />
                    )}
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => { if(results.length > 0) setIsDropdownOpen(true); }}
                    placeholder="Search for a product..."
                    autoComplete="off"
                    className="bg-gray-dark border border-gray-600 text-white sm:text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-full p-2.5 pl-10"
                />
            </div>
            {isDropdownOpen && results.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-gray-medium border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                    {results.map((product) => (
                        <li
                            key={product.id}
                            onClick={() => handleSelectProduct(product)}
                            className="text-white px-4 py-2 hover:bg-brand-primary cursor-pointer"
                        >
                            {product.name}
                        </li>
                    ))}
                </ul>
            )}
            {isDropdownOpen && !isLoading && results.length === 0 && searchTerm.length > 1 && (
                 <div className="absolute z-10 w-full mt-1 bg-gray-medium border border-gray-600 rounded-md shadow-lg p-4 text-center text-gray-light">
                    No products found.
                 </div>
            )}
        </div>
    );
};

export default ProductSearch;
