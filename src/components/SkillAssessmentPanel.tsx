import { useState, useEffect, useCallback } from 'react';
import { Star, ClipboardList, Plus, Loader2, ChevronDown } from 'lucide-react';
import Modal from './Modal';
import {
  apiCreateSkillAssessment,
  apiListSkillAssessments,
  averageSkillScore,
  SKILL_ASSESSMENT_PARAMETERS,
  MIN_SKILL_SCORE,
  MAX_SKILL_SCORE,
  type ApiSkillAssessment,
} from '../lib/api/skillAssessments';
import { formatInIST } from '../lib/utils';
import { useToast } from '../toast';

const STARS = Array.from({ length: MAX_SKILL_SCORE - MIN_SKILL_SCORE + 1 }, (_, i) => i + MIN_SKILL_SCORE);

function StarRating({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={readOnly ? 'cursor-default' : 'cursor-pointer'}
          title={`${n}/5`}
        >
          <Star
            size={readOnly ? 13 : 20}
            className={n <= value ? 'text-gold fill-gold' : 'text-zinc-700'}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A mentor's placement-readiness read on one student — mentor + admin only,
 * lazy-loaded so it only fetches once a mentor actually expands this student
 * rather than for the whole roster up front.
 */
export default function SkillAssessmentPanel({ studentId, cohortId }: { studentId: string; cohortId: string }) {
  const { showSuccess, showError } = useToast();
  const [history, setHistory] = useState<ApiSkillAssessment[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    apiListSkillAssessments(studentId, cohortId)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [studentId, cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = history?.[0] ?? null;
  const older = history?.slice(1) ?? [];

  return (
    <div className="mt-3 pt-3 border-t border-zinc-750/60">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <ClipboardList size={12} />
          Placement Readiness
        </p>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-zinc-800 text-gray-300 hover:text-gold hover:bg-zinc-750 transition-colors"
        >
          <Plus size={11} />
          New assessment
        </button>
      </div>

      {history === null ? (
        <div className="py-3 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-gray-500" />
        </div>
      ) : !latest ? (
        <p className="text-xs text-gray-500">No assessments yet — the first one starts the trend.</p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">
              Last rated {formatInIST(latest.assessedAt, { day: '2-digit', month: 'short' })}
              {latest.mentorName ? ` by ${latest.mentorName}` : ''}
            </span>
            <span className="text-xs font-semibold text-white tabular-nums">
              {averageSkillScore(latest.scores)} <span className="text-gray-500 font-normal">avg</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {SKILL_ASSESSMENT_PARAMETERS.map((param) => (
              <div key={param.key} className="flex items-center justify-between gap-2" title={param.description}>
                <span className="text-[11px] text-gray-400 truncate">{param.label}</span>
                <StarRating value={latest.scores[param.key] ?? 0} readOnly />
              </div>
            ))}
          </div>

          {latest.note && <p className="text-xs text-gray-400 italic">"{latest.note}"</p>}

          {older.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronDown size={12} className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                {older.length} earlier assessment{older.length === 1 ? '' : 's'}
              </button>
              {historyOpen && (
                <div className="mt-2 space-y-1.5">
                  {older.map((snap) => (
                    <div key={snap.id} className="flex items-center justify-between text-[11px] text-gray-500 bg-zinc-950/40 rounded-md px-2.5 py-1.5">
                      <span>
                        {formatInIST(snap.assessedAt, { day: '2-digit', month: 'short', year: 'numeric' })}
                        {snap.mentorName ? ` · ${snap.mentorName}` : ''}
                      </span>
                      <span className="font-semibold text-gray-300 tabular-nums">{averageSkillScore(snap.scores)} avg</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <NewAssessmentModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={async (scores, note) => {
          try {
            await apiCreateSkillAssessment(studentId, { cohortId, scores, note: note || undefined });
            showSuccess('Assessment saved');
            setFormOpen(false);
            load();
          } catch (err) {
            showError(err instanceof Error ? err.message : 'Could not save that assessment');
          }
        }}
      />
    </div>
  );
}

function NewAssessmentModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (scores: Record<string, number>, note: string) => Promise<void>;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset to a blank form each time the modal opens, rather than carrying
  // over whatever a previous assessment (of possibly a different student)
  // left behind.
  useEffect(() => {
    if (open) {
      setScores({});
      setNote('');
    }
  }, [open]);

  const allRated = SKILL_ASSESSMENT_PARAMETERS.every((p) => scores[p.key] >= MIN_SKILL_SCORE);

  const submit = async () => {
    if (!allRated) return;
    setSaving(true);
    try {
      await onSubmit(scores, note.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New placement-readiness assessment" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Rate each area 1 (needs real work) to 5 (placement-ready). This adds a new snapshot — it never overwrites an
          earlier one, so their trend across the OJT stays visible.
        </p>

        <div className="space-y-3">
          {SKILL_ASSESSMENT_PARAMETERS.map((param) => (
            <div key={param.key} className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-white font-medium">{param.label}</p>
                <p className="text-[11px] text-gray-500">{param.description}</p>
              </div>
              <StarRating value={scores[param.key] ?? 0} onChange={(v) => setScores((s) => ({ ...s, [param.key]: v }))} />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Anything specific worth remembering next time you assess them."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !allRated}
            title={!allRated ? 'Rate every parameter before saving' : undefined}
            className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save assessment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
