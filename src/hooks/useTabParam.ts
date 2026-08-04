import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * The active sidebar tab, kept in the URL instead of component state.
 *
 * The panels navigate between their top-level sections by flipping a local
 * variable, which meant the address bar said /student/dashboard no matter
 * which section was open. Reloading threw the person back to the dashboard,
 * browser back/forward did nothing inside a panel, and no screen could be
 * linked to or bookmarked — all three are the same missing piece.
 *
 * A search param rather than real nested routes: it is the whole fix in one
 * hook, where routes would mean restructuring three panels and re-parenting
 * every section component. Prettier paths are worth doing later; being on the
 * page you reloaded is worth doing now.
 *
 * `replace` on write, so paging through tabs doesn't build a history entry per
 * click — back should leave the panel, not walk the tabs you visited.
 */
export function useTabParam(defaultTab: string): [string, (tab: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? defaultTab;

  const setTab = useCallback(
    (next: string) => {
      setSearchParams(
        previous => {
          const params = new URLSearchParams(previous);
          // The default is what an absent param already means, so it is left
          // out — otherwise every panel's landing URL carries ?tab=dashboard.
          if (next === defaultTab) params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true }
      );
    },
    [defaultTab, setSearchParams]
  );

  return [tab, setTab];
}
