import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  combineFoodSearchResults,
  searchPersonalFoods,
  searchRemoteFood,
  type FoodResult,
  type FoodSearchMode,
  type FoodSearchOutcome,
} from '../services/foodSearch';

export type RemoteSearchState = 'idle' | 'loading' | FoodSearchOutcome['kind'];

export function useFoodSearchController(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [personalResults, setPersonalResults] = useState<FoodResult[]>([]);
  const [remoteResults, setRemoteResults] = useState<FoodResult[]>([]);
  const [remoteState, setRemoteState] = useState<RemoteSearchState>('idle');
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState(false);
  const [mode, setMode] = useState<FoodSearchMode>('common');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const localSequence = useRef(0);
  const remoteSequence = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sequence = ++localSequence.current;
    setLocalLoading(true);
    setLocalError(false);
    void searchPersonalFoods(query).then((items) => {
      if (sequence === localSequence.current) setPersonalResults(items);
    }).catch((error) => {
      console.error('[FoodSearch] personal history failed', error);
      if (sequence === localSequence.current) {
        setPersonalResults([]);
        setLocalError(true);
      }
    }).finally(() => {
      if (sequence === localSequence.current) setLocalLoading(false);
    });
  }, [query, refreshVersion]);

  const runRemote = useCallback(async (searchMode: FoodSearchMode) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const sequence = ++remoteSequence.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMode(searchMode);
    setRemoteState('loading');
    try {
      const outcome = await searchRemoteFood(trimmed, searchMode, controller.signal);
      if (sequence !== remoteSequence.current) return;
      setRemoteResults(outcome.items);
      setRemoteState(outcome.kind);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('[FoodSearch] online search failed', error);
      if (sequence === remoteSequence.current) {
        setRemoteResults([]);
        setRemoteState('unavailable');
      }
    }
  }, [query]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    remoteSequence.current += 1;
    setMode('common');
    setRemoteResults([]);
    if (query.trim().length < 2) {
      setRemoteState('idle');
      return;
    }
    setRemoteState('loading');
    debounceRef.current = setTimeout(() => { void runRemote('common'); }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runRemote]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const combined = useMemo(
    () => combineFoodSearchResults(personalResults, remoteResults, query, mode),
    [mode, personalResults, query, remoteResults],
  );

  return {
    query,
    setQuery,
    personalResults: combined.filter((item) => item.history != null),
    remoteResults: combined.filter((item) => item.history == null),
    remoteState,
    localLoading,
    localError,
    submit: () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void runRemote('full');
    },
    retry: () => { void runRemote(mode); },
    refreshLocal: () => setRefreshVersion((version) => version + 1),
  };
}
