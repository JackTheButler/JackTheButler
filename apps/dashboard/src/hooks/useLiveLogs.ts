import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import type { LogEntry, SystemLogsFilters } from './useSystemLogs';

export type LiveState = 'off' | 'live' | 'paused';

const POLL_INTERVAL_MS = 10_000;
const LIVE_FETCH_LIMIT = 100;
const HIGHLIGHT_DURATION_MS = 3_000;

export interface UseLiveLogsResult {
  liveState: LiveState;
  entries: LogEntry[];
  highlightIds: Set<string>;
  isInitializing: boolean;
  startLive: () => void;
  pauseLive: () => void;
  resumeLive: () => void;
  stopLive: () => void;
}

export function useLiveLogs(filters: SystemLogsFilters): UseLiveLogsResult {
  const [liveState, setLiveState] = useState<LiveState>('off');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [isInitializing, setIsInitializing] = useState(false);

  // Track the createdAt of the newest entry seen — used as `since` for incremental polls
  const latestRef = useRef<string | null>(null);
  // Avoid stale closure on liveState inside the filter-reset effect
  const liveStateRef = useRef<LiveState>('off');
  liveStateRef.current = liveState;

  const fetchEntries = useCallback(
    (since: string | null) => {
      const params = new URLSearchParams();
      if (filters.source !== 'all') params.set('source', filters.source);
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to)   params.set('to',   filters.to);
      if (since)        params.set('since', since);
      params.set('limit', String(LIVE_FETCH_LIMIT));
      return api.get<{ logs: LogEntry[] }>(`/system/logs?${params.toString()}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.source, filters.status, filters.from, filters.to]
  );

  // When filters change while live or paused — reset and refetch from scratch
  useEffect(() => {
    if (liveStateRef.current === 'off') return;
    latestRef.current = null;
    setEntries([]);
    setHighlightIds(new Set());
    if (liveStateRef.current === 'paused') setLiveState('live');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.source, filters.status, filters.from, filters.to]);

  // Polling — runs when live, stops when paused or off
  useEffect(() => {
    if (liveState !== 'live') return;

    let cancelled = false;

    // Initial fetch when starting fresh (not resuming from pause)
    if (latestRef.current === null) {
      setIsInitializing(true);
      fetchEntries(null)
        .then((data) => {
          if (cancelled) return;
          setEntries(data.logs);
          latestRef.current = data.logs[0]?.createdAt ?? null;
        })
        .catch(() => {/* polling errors are non-fatal */})
        .finally(() => { if (!cancelled) setIsInitializing(false); });
    }

    // Incremental polls every 10s
    const interval = setInterval(() => {
      fetchEntries(latestRef.current)
        .then((data) => {
          if (cancelled || data.logs.length === 0) return;
          const ids = new Set(data.logs.map((l) => l.id));
          setHighlightIds(ids);
          setEntries((prev) => [...data.logs, ...prev]);
          latestRef.current = data.logs[0]!.createdAt;
          setTimeout(() => setHighlightIds(new Set()), HIGHLIGHT_DURATION_MS);
        })
        .catch(() => {/* polling errors are non-fatal */});
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [liveState, fetchEntries]);

  return {
    liveState,
    entries,
    highlightIds,
    isInitializing,
    startLive: () => {
      latestRef.current = null;
      setEntries([]);
      setHighlightIds(new Set());
      setLiveState('live');
    },
    pauseLive:  () => setLiveState('paused'),
    resumeLive: () => setLiveState('live'),   // latestRef preserved → resumes from last seen entry
    stopLive: () => {
      latestRef.current = null;
      setEntries([]);
      setHighlightIds(new Set());
      setLiveState('off');
    },
  };
}
