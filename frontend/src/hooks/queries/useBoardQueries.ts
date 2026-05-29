import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { UpdateBoardData, CreateBoardData, DuplicateMode } from '@/services/workManagementService';

export const useBoards = (workspaceId?: string, includeArchived = false, enabled = true) =>
  useQuery({
    queryKey: queryKeys.boards.all(workspaceId, includeArchived),
    queryFn: () => wm.listBoards(workspaceId, includeArchived),
    enabled,
    staleTime: 2 * 60 * 1000,
  });

export const useBoard = (id: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.boards.one(id),
    queryFn: () => wm.getBoard(id),
    enabled: enabled && !!id,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBoardData) => wm.createBoard(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
};

export const useUpdateBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateBoardData }) => wm.updateBoard(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.boards.one(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
};

export const useArchiveBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.archiveBoard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
};

export const useRestoreBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.restoreBoard(id),
    onSuccess: (restored) => {
      qc.setQueryData(queryKeys.boards.one(restored.id), restored);
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
};

export const useDeleteBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteBoard(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.boards.one(id) });
      void qc.invalidateQueries({ queryKey: ['boards'] });
      void qc.invalidateQueries({ queryKey: ['boardTemplates'] });
    },
  });
};

export const useDuplicateBoard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: DuplicateMode }) => wm.duplicateBoard(id, mode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] });
    },
  });
};

export const useSaveAsBoardTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, mode }: { id: string; name?: string; mode: DuplicateMode }) => wm.saveAsBoardTemplate(id, name, mode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['boards'] });
      void qc.invalidateQueries({ queryKey: ['boardTemplates'] });
    },
  });
};

export const useBoardTemplates = (enabled = true) =>
  useQuery({
    queryKey: ['boardTemplates'],
    queryFn: () => wm.listTemplates(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

export const useArchivedBoardTemplates = (enabled = false) =>
  useQuery({
    queryKey: ['boardTemplates', 'archived'],
    queryFn: async () => {
      const all = await wm.listArchivedTemplates();
      return all.filter((b) => b.isArchived === true);
    },
    enabled,
    staleTime: 2 * 60 * 1000,
  });
