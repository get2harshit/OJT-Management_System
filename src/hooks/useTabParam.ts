import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
 *
 * `basePath` is for a panel that also has nested routes of its own: picking a
 * tab has to close whichever sub-page is open, or that route keeps matching
 * and renders straight over the tab that was just chosen. Passing it makes the
 * setter write the path and the tab in a single navigation. Doing those as two
 * calls does not work — the second one lands on a URL with no query string and
 * silently drops the tab the first had just set, so the tab reverts to the
 * default and the sidebar looks dead. Panels with no nested routes leave it
 * out and only the param moves.
 */
export function useTabParam(
  defaultTab: string,
  basePath?: string
): [string, (tab: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get('tab') ?? defaultTab;

  const setTab = useCallback(
    (next: string) => {
      // The default is what an absent param already means, so it is left out —
      // otherwise every panel's landing URL carries ?tab=dashboard.
      const isDefault = next === defaultTab;

      if (basePath) {
        navigate(
          { pathname: basePath, search: isDefault ? '' : `?tab=${encodeURIComponent(next)}` },
          { replace: true }
        );
        return;
      }

      setSearchParams(
        previous => {
          const params = new URLSearchParams(previous);
          if (isDefault) params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true }
      );
    },
    [basePath, defaultTab, navigate, setSearchParams]
  );

  return [tab, setTab];
}
