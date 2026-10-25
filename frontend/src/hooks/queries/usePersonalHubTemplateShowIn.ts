import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPersonalHubTemplate } from '@/services/geminiService';
import { queryKeys } from './queryKeys';
import type { TemplateColumnShowIn } from '../../types';

/** Template column id → where the org admin chose to show it (Today / My Items / both). */
export function usePersonalHubTemplateShowIn(): ReadonlyMap<string, TemplateColumnShowIn> {
  const { data } = useQuery({
    queryKey: queryKeys.personalHubTemplateTotals.templateColumns,
    queryFn: () => getPersonalHubTemplate(),
    staleTime: 5 * 60 * 1000,
  });
  return useMemo(() => {
    const m = new Map<string, TemplateColumnShowIn>();
    (data?.columns ?? []).forEach((c) => { if (c.showIn) m.set(c.id, c.showIn); });
    return m;
  }, [data]);
}
