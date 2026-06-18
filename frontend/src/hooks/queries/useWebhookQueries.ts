import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as wm from '@/services/workManagementService';
import type { CreateWebhookData, UpdateWebhookData } from '@/services/workManagementService';

const webhookKey = (boardId: string, groupId: string) => ['webhook', boardId, groupId] as const;

export const useGroupWebhook = (boardId: string, groupId: string, enabled = true) =>
  useQuery({
    queryKey: webhookKey(boardId, groupId),
    queryFn: () => wm.getGroupWebhook(boardId, groupId),
    enabled: enabled && !!boardId && !!groupId,
    staleTime: 30 * 1000,
    retry: false,
  });

export const useCreateGroupWebhook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, groupId, data }: { boardId: string; groupId: string; data: CreateWebhookData }) =>
      wm.createGroupWebhook(boardId, groupId, data),
    onSuccess: (result, { boardId, groupId }) => {
      qc.setQueryData(webhookKey(boardId, groupId), result);
    },
  });
};

export const useUpdateGroupWebhook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, groupId, data }: { boardId: string; groupId: string; data: UpdateWebhookData }) =>
      wm.updateGroupWebhook(boardId, groupId, data),
    onSuccess: (result, { boardId, groupId }) => {
      qc.setQueryData(webhookKey(boardId, groupId), result);
    },
  });
};

export const useRevokeGroupWebhook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, groupId }: { boardId: string; groupId: string }) =>
      wm.revokeGroupWebhook(boardId, groupId),
    onSuccess: (_result, { boardId, groupId }) => {
      void qc.invalidateQueries({ queryKey: webhookKey(boardId, groupId) });
    },
  });
};
