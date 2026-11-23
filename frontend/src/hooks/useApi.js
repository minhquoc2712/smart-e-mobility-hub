import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared data-loading hook (Task: real API integration).
 *
 * const { data, loading, error, reload, setData } = useApi(() => hubApi.getHubs(), [filters]);
 *
 * - Runs `fetcher` on mount and whenever `deps` change.
 * - Ignores responses that arrive after the component unmounted or after a newer
 *   request started (prevents stale data from overwriting fresh data).
 * - `reload()` re-runs the request, e.g. for a "Try again" button or after a mutation.
 * - `setData` lets a page apply optimistic updates without refetching.
 * - Pass `{ enabled: false }` to skip loading until a prerequisite (e.g. an id) exists.
 */
export function useApi(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (requestId === requestIdRef.current) setData(result);
      return result;
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err);
      return undefined;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    load();
    // Invalidate in-flight requests when deps change or the component unmounts.
    return () => {
      requestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps]);

  return { data, loading, error, reload: load, setData };
}
