import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConversationDetail, ConversationSummary } from '@janetheoperator/shared';
import { api } from '@/lib/api';

/** Conversation data layer: TanStack Query for load/mutations, the
 *  authed dashboard WebSocket for live invalidation. */

export type StatusFilter = 'open' | 'closed' | undefined;

export function useConversationList(status: StatusFilter) {
  return useQuery({
    queryKey: ['conversations', status ?? 'all'],
    queryFn: () =>
      api.get<{ conversations: ConversationSummary[] }>(
        `/api/app/conversations${status ? `?status=${status}` : ''}`,
      ),
  });
}

/** Team-wide count of open conversations awaiting a reply (not per-agent
 *  unread — that's Stage 8). Live via the shared query + dashboard socket. */
export function useInboxCount(): number {
  const { data } = useConversationList(undefined);
  return (data?.conversations ?? []).filter(
    (c) => c.status === 'open' && c.needsReply,
  ).length;
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: () => api.get<ConversationDetail>(`/api/app/conversations/${id}`),
  });
}

function useConversationAction(path: (id: string) => string, body?: () => unknown) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ConversationDetail>(path(id), body?.()),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['conversation', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export const useTakeover = () =>
  useConversationAction((id) => `/api/app/conversations/${id}/takeover`);
export const useHandback = () =>
  useConversationAction((id) => `/api/app/conversations/${id}/handback`);
export const useClose = () =>
  useConversationAction((id) => `/api/app/conversations/${id}/close`);
export const useReopen = () =>
  useConversationAction((id) => `/api/app/conversations/${id}/reopen`);

export function useReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.post<ConversationDetail>(`/api/app/conversations/${id}/reply`, { content }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['conversation', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/** Single authed dashboard socket → invalidate on live events. Generic
 *  envelope, so future event types just add a case here. */
export function useDashboardSocket() {
  const qc = useQueryClient();
  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/app/realtime`);
      ws.onmessage = (e) => {
        try {
          const { type, data } = JSON.parse(e.data);
          if (type === 'message.created') {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['conversation', data?.conversationId] });
          } else if (type === 'message.updated') {
            // In-flight enrichment (language + translation populated by the
            // pipeline after detect/translate). Patch the cached conversation
            // detail in-place so the bubble re-renders with the toggle, no
            // full refetch needed.
            qc.setQueryData<ConversationDetail>(
              ['conversation', data?.conversationId],
              (prev) =>
                prev
                  ? {
                      ...prev,
                      messages: prev.messages.map((m) =>
                        m.id === data.messageId
                          ? { ...m, language: data.language, translation: data.translation }
                          : m,
                      ),
                    }
                  : prev,
            );
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (alive) setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      alive = false;
      ws?.close();
    };
  }, [qc]);
}
