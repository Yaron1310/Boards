import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateFormData, UpdateFormData } from '@/services/workManagementService';
import type { FormAnswerValue } from '@/types';

// --- Form definitions (the /forms page) ---

export const useForms = (includeArchived = false, enabled = true) =>
  useQuery({
    queryKey: queryKeys.forms.list(includeArchived),
    queryFn: () => wm.listForms(includeArchived),
    enabled,
    staleTime: 0,
  });

export const useCreateForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFormData) => wm.createForm(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.all });
    },
  });
};

export const useUpdateForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateFormData }) => wm.updateForm(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.all });
    },
  });
};

export const useArchiveForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.archiveForm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.all });
    },
  });
};

export const useRestoreForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.restoreForm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.all });
    },
  });
};

export const useDeleteForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteForm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.all });
    },
  });
};

// --- Forms attached to an item (the item form sidebar) ---

export const useItemForms = (itemId: string) =>
  useQuery({
    queryKey: queryKeys.forms.forItem(itemId),
    queryFn: () => wm.listItemForms(itemId),
    enabled: !!itemId,
    staleTime: 0,
  });

/** Attaching/detaching changes the item's formResponseCount, so items are refreshed too. */
export const useAttachFormToItem = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) => wm.attachFormToItem(itemId, formId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.forItem(itemId) });
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useSaveItemFormResponse = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, values, submit }: { formId: string; values: Record<string, FormAnswerValue>; submit?: boolean }) =>
      wm.saveItemFormResponse(itemId, formId, values, submit ?? false),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.forItem(itemId) });
    },
  });
};

export const useDetachFormFromItem = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) => wm.detachFormFromItem(itemId, formId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.forms.forItem(itemId) });
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};
