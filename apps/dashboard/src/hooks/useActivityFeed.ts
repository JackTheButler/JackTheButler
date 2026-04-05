import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types (mirror backend ActivityItem)
// ---------------------------------------------------------------------------

export type ActivityEventType = 'ai_reply' | 'ai_resolved' | 'task_created' | 'checkin' | 'escalated' | 'checkout';

export interface ActivityItem {
  id: string;
  type: ActivityEventType;
  text: string;
  detail: string;
  ts: number; // Unix ms
  channel?: string; // e.g. 'whatsapp', 'email', 'sms', 'webchat'
  data?: {
    taskType?: string;
    priority?: string;
    roomNumber?: string;
    roomType?: string;
    guestName?: string;
    intent?: string;
    snippet?: string;
  };
}

const MAX_ITEMS = 20;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useActivityFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ['activities-recent'],
    queryFn: () => api.get<{ items: ActivityItem[] }>('/activities/recent?limit=20'),
    staleTime: 60_000,
  });

  const [items, setItems] = useState<ActivityItem[]>([]);

  // Merge API response with any WS items already received, deduplicating by ID
  useEffect(() => {
    if (data?.items) {
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newFromServer = data.items.filter((i) => !existingIds.has(i.id));
        const merged = [...prev, ...newFromServer];
        merged.sort((a, b) => b.ts - a.ts);
        return merged.slice(0, MAX_ITEMS);
      });
    }
  }, [data]);

  // Subscribe to real-time WebSocket events, deduplicating by ID
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<ActivityItem>).detail;
      setItems((prev) => {
        if (prev.some((i) => i.id === item.id)) return prev;
        return [item, ...prev].slice(0, MAX_ITEMS);
      });
    };
    window.addEventListener('ws:activity:event', handler);
    return () => window.removeEventListener('ws:activity:event', handler);
  }, []);

  return { items, isLoading };
}
