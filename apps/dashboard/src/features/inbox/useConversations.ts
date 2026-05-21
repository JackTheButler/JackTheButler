import { useEffect, useRef, useState } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import type { ConversationDetail, ConversationSummary } from '@janetheoperator/shared';
import { api } from '@/lib/api';
import { useRealtimeEvent } from '@/lib/realtime';

/** Conversation data layer: TanStack Query for load/mutations, the shared
 *  realtime bus for live invalidation. */

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

/** Inbox's slice of realtime: subscribe to the two message events on the
 *  shared bus and keep TanStack Query in sync. No socket plumbing here —
 *  that lives in lib/realtime; this just declares what the inbox cares
 *  about. */
export function useInboxRealtime() {
  const qc = useQueryClient();

  useRealtimeEvent<{ conversationId: string }>('message.created', (data) => {
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['conversation', data?.conversationId] });
  });

  useRealtimeEvent<{
    conversationId: string;
    messageId: string;
    language: string | null;
    translation: string | null;
  }>('message.updated', (data) => {
    // In-flight enrichment (language + translation populated by the pipeline
    // after detect/translate). Patch the cached conversation detail in place
    // so the bubble re-renders with the toggle — no full refetch.
    qc.setQueryData<ConversationDetail>(['conversation', data?.conversationId], (prev) =>
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
  });
}

/** Tell the server an agent is typing, so the customer's widget shows the
 *  indicator. Fire-and-forget; the composer throttles calls. */
export function notifyTyping(id: string): void {
  api.post(`/api/app/conversations/${id}/typing`).catch(() => {});
}

/** Whether the AI is currently composing a reply in `conversationId` — driven
 *  by the pipeline's `assistant.typing` event. Cleared when the reply (any
 *  non-customer message) lands, on conversation switch, or after a safety
 *  timeout (the rare errored turn never sends a message). */
export function useAssistantTyping(conversationId: string | null): boolean {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTyping(false);
  };

  useRealtimeEvent<{ conversationId: string }>('assistant.typing', (data) => {
    if (!conversationId || data?.conversationId !== conversationId) return;
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), 10000);
  });

  useRealtimeEvent<{ conversationId: string; message?: { author?: string } }>(
    'message.created',
    (data) => {
      if (data?.conversationId !== conversationId) return;
      if (data?.message?.author === 'customer') return; // the inbound, not the reply
      stop();
    },
  );

  // Reset when switching conversations.
  useEffect(() => stop, [conversationId]);

  return typing;
}
