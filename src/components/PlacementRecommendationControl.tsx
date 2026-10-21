import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { apiSetPlacementRecommendation } from '../lib/api/skillAssessments';
import type { ApiPlacementRecommendation } from '../lib/api/teamRoster';
import { formatInIST } from '../lib/utils';
import { useToast } from '../toast';

const REASON_MAX_LENGTH = 500;

/** Labels shared with the assessment form, so one recommendation is never called two things. */
const CHOICES: { value: boolean; label: string }[] = [
  { value: true, label: 'Recommended' },
  { value: false, label: 'Not Recommended' },
];

function chipStyle(current: ApiPlacementRecommendation | null): { className: string; label: string } {
  if (!current) return { className: 'bg-zinc-800 text-gray-500 border-zinc-750', label: 'No recommendation' };
  return current.recommended
    ? { className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Recommended' }
    : { className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', label: 'Not Recommended' };
}

/**
 * The current recommendation as a chip that opens the editor. Kept apart from
 * the editor itself because the chip sits inside a clickable row while the
 * dialog must not: Modal renders in place, so a dialog inside the row would
 * pass every click and keystroke (a space typed in the reason) up to the row
 * and toggle it.
 */
export function PlacementRecommendationChip({
  current,
  onOpen,
}: {
  current: ApiPlacementRecommendation | null;
  onOpen: () => void;
}) {
  const chip = chipStyle(current);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title="Change placement recommendation"
      className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap hover:brightness-125 transition ${chip.className}`}
    >
      {chip.label}
    </button>
  );
}

/**
 * Changes a student's placement recommendation without recording an
 * assessment. Mentor-facing only — the student never sees it, and the
 * backend never sends it to them.
 */
export function PlacementRecommendationModal({
  open,
  studentId,
  studentName,
  cohortId,
  current,
  onClose,
  onSaved,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  cohortId: string;
  current: ApiPlacementRecommendation | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { showSuccess, showError } = useToast();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Start from the current recommendation every time the dialog opens, so a
  // cancelled edit never leaks into the next one. Read only on open: a roster
  // refresh landing mid-edit must not overwrite what the mentor is typing.
  useEffect(() => {
    if (!open) return;
    setChoice(current?.recommended ?? null);
    setReason(current?.reason ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unchanged = current !== null && choice === current.recommended && reason.trim() === (current.reason ?? '');

  const save = async () => {
    if (choice === null || unchanged) return;
    setSaving(true);
    try {
      await apiSetPlacementRecommendation(studentId, {
        cohortId,
        recommended: choice,
        reason: reason.trim() || undefined,
      });
      showSuccess('Placement recommendation updated');
      onClose();
      await onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update the recommendation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Placement recommendation · ${studentName}`}>
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Your recommendation only — the placement decision is made separately. The student does not see this.
        </p>

        {current && (
          <p className="text-[11px] text-gray-400">
            Currently <span className="text-gray-200">{current.recommended ? 'Recommended' : 'Not Recommended'}</span>
            {current.recommendedByName ? ` by ${current.recommendedByName}` : ''},{' '}
            {formatInIST(current.recommendedAt, { day: '2-digit', month: 'short' })}
            {current.fromAssessment ? ' (with an assessment)' : ''}.
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Placement recommendation">
          {CHOICES.map(({ value, label }) => {
            const selected = choice === value;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(value)}
                className={`rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-gold/60 ${
                  selected
                    ? 'bg-gold text-black border-gold'
                    : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div>
          <label htmlFor={`placement-reason-${studentId}`} className="text-[11px] text-gray-400">
            Reason (optional)
          </label>
          <textarea
            id={`placement-reason-${studentId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
            rows={3}
            placeholder="What this is based on, or what would change it"
            className="mt-1 w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg bg-zinc-800 text-gray-300 hover:bg-zinc-750 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || choice === null || unchanged}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-gold text-black font-semibold hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
