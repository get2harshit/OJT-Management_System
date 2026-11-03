import { useAuth } from '../context/useAuth';

/**
 * True for an admin who can see everything but change nothing. Pages use it to
 * hide their action buttons; the API client and the server refuse the writes
 * regardless, so a button left showing fails safely.
 */
export function useViewOnly(): boolean {
  const { user } = useAuth();
  return user?.role === 'admin' && user.isViewOnly === true;
}
