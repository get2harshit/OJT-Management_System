import { useCallback, useEffect, useState } from 'react';
import { apiListTracks, type ApiTrack } from '../lib/api/tracks';
import type { SelectOption } from '../components/Select';

// Active tracks, fetched once per mount (apiListTracks is itself cached, so
// multiple components mounting this hook within the TTL window share one
// network request). Returns both the raw tracks and ready-to-use Select
// options (value = slug, label = display name), plus a refetch for callers
// that just mutated the track list (create/rename/deactivate already
// invalidate the underlying cache, so this refetch gets fresh data).
export function useTracks() {
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListTracks();
      setTracks(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiListTracks()
      .then((data) => {
        if (!cancelled) setTracks(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectOption[] = tracks.map((t) => ({ value: t.slug, label: t.name }));

  return { tracks, options, loading, refetch };
}
