import { useState, useEffect } from 'react';

const ROW_HEIGHT_PX = 38;
// Approximate vertical space consumed by top bar, column header, group header, and add-item row
const CHROME_PX = 170;

export function usePageSize(): number {
  const calc = () => Math.max(5, Math.floor((window.innerHeight - CHROME_PX) / ROW_HEIGHT_PX));
  const [pageSize, setPageSize] = useState(calc);

  useEffect(() => {
    const handler = () => setPageSize(calc());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return pageSize;
}
