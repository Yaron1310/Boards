import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { ChatMessage } from '@/types';

export const useChatMessages = (itemId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.chat.messages(itemId),
    queryFn: () => wm.listChatMessages(itemId),
    enabled: enabled && !!itemId,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });

export const usePostChatMessage = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, files }: { text: string; files?: File[] }) =>
      wm.postChatMessage(itemId, text, files),
    onSuccess: (newMsg: ChatMessage) => {
      qc.setQueryData<ChatMessage[]>(queryKeys.chat.messages(itemId), (old) =>
        old ? [...old, newMsg] : [newMsg],
      );
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useDeleteChatMessage = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => wm.deleteChatMessage(itemId, messageId),
    onSuccess: (_data, messageId) => {
      qc.setQueryData<ChatMessage[]>(queryKeys.chat.messages(itemId), (old) =>
        old ? old.filter((m) => m.id !== messageId) : [],
      );
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};
