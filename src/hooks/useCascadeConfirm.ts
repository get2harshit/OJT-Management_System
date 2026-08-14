import { useState } from 'react';
import { useConfirm } from '../confirm';
import { useToast } from '../toast';
import { FutureSessionsConflictError } from '../lib/api';

/**
 * Shared wrapper for roster actions that can disturb sessions already on the
 * calendar (remove member, reassign mentor). The backend blocks those with a
 * 409 listing how many upcoming sessions would be affected; this runs the
 * action, and on that specific conflict asks the caller-supplied question
 * before retrying with the cascade flag — never retries silently.
 */
export function useCascadeConfirm() {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const { showError } = useToast();

  const withCascadeConfirm = async (
    run: (cascade: boolean) => Promise<void>,
    prompt: (count: number) => { title: string; message: string; confirmLabel: string }
  ) => {
    setBusy(true);
    try {
      await run(false);
    } catch (err) {
      if (err instanceof FutureSessionsConflictError) {
        const { title, message, confirmLabel } = prompt(err.futureSessionCount);
        const proceed = await confirm({ title, message, confirmLabel, variant: 'danger' });
        if (!proceed) {
          setBusy(false);
          return;
        }
        try {
          await run(true);
        } catch (retryErr) {
          showError(retryErr instanceof Error ? retryErr.message : 'Action failed');
          setBusy(false);
          return;
        }
      } else {
        showError(err instanceof Error ? err.message : 'Action failed');
        setBusy(false);
        return;
      }
    }
    setBusy(false);
  };

  return { busy, withCascadeConfirm };
}
