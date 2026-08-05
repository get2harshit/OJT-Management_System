import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Sends an old `?tab=` URL to the route that replaced it.
 *
 * The panels used to keep their open section in a search param, so anything
 * saved or shared while that was true — a bookmark, a link in a message, a tab
 * left open over the weekend — points at `/admin/dashboard?tab=students`.
 * Without this those all land on the dashboard, which looks like the link was
 * wrong rather than merely old.
 *
 * Only fires on the panel's own base path: a sub-page carrying an unrelated
 * `tab` param of its own is left alone rather than being yanked out of the page
 * somebody is on.
 *
 * `replace`, so Back leaves the panel instead of bouncing through the URL that
 * was just rewritten. Any other params are preserved.
 */
export function useLegacyTabRedirect(basePath: string, defaultTab = 'dashboard'): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== basePath) return;

    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (!tab) return;

    params.delete('tab');
    const remaining = params.toString();
    navigate(
      {
        pathname: tab === defaultTab ? basePath : `${basePath}/${tab}`,
        search: remaining ? `?${remaining}` : '',
      },
      { replace: true }
    );
  }, [location.pathname, location.search, basePath, defaultTab, navigate]);
}
