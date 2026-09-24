import { useEffect, useState } from 'react';
import { ShieldCheck, ChevronDown, LogOut } from 'lucide-react';
import { apiListActableMentors, type ApiActableMentor } from '../lib/api/mentorCoGrants';
import { getActingMentorId, setActingMentorId } from '../lib/api/client';

const MENTOR_PANEL_ROOT = '/mentor/dashboard';

/**
 * Switches the whole mentor panel over to another mentor an admin granted
 * this user full co-mentor access to — the "mentor left / two of us run this
 * roster" case.
 *
 * Deliberately a switch rather than a merge: both mentors' students in one
 * blended list would leave nobody able to tell whose student they were about
 * to act on, and would double-count every figure on the dashboard.
 *
 * Switching reloads the panel on purpose. It is a rare, deliberate action,
 * and a reload is what guarantees no screen is left holding data fetched as
 * the previous identity.
 */
export default function ActingAsSwitcher() {
  const [actable, setActable] = useState<ApiActableMentor[]>([]);
  const [open, setOpen] = useState(false);
  const actingAsId = getActingMentorId();

  useEffect(() => {
    apiListActableMentors()
      .then(setActable)
      .catch(() => setActable([]));
  }, []);

  // Nobody has shared a roster with this mentor — the switcher should not
  // exist for them at all, not sit there empty.
  if (actable.length === 0) return null;

  const current = actable.find((m) => m.mentorId === actingAsId) ?? null;

  const switchTo = (mentorId: string | null) => {
    setActingMentorId(mentorId);
    window.location.assign(MENTOR_PANEL_ROOT);
  };

  if (current) {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap bg-violet-500/10 border border-violet-500/25 text-violet-300 text-sm rounded-lg px-4 py-2.5 mb-4">
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className="shrink-0" />
          <span>
            You&apos;re working as <span className="font-semibold text-violet-200">{current.mentorName ?? 'another mentor'}</span>
            {current.cohortName ? <> in <span className="font-semibold text-violet-200">{current.cohortName}</span></> : null} — full
            access. Anything you do is still recorded under your own name.
          </span>
        </span>
        <button
          onClick={() => switchTo(null)}
          className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md border border-violet-500/30 hover:bg-violet-500/15 transition-colors font-medium"
        >
          <LogOut size={14} />
          Back to my own OJTs
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-zinc-850 border border-zinc-750 rounded-lg hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <ShieldCheck size={15} className="text-violet-400" />
        Work as another mentor
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-80 bg-zinc-850 border border-zinc-750 rounded-lg shadow-xl p-1">
          {actable.map((m) => (
            <button
              key={`${m.mentorId}:${m.cohortId}`}
              onClick={() => switchTo(m.mentorId)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-800 transition-colors"
            >
              <p className="text-sm text-white font-medium truncate">{m.mentorName ?? m.mentorId}</p>
              <p className="text-xs text-gray-500 truncate">{m.cohortName ?? 'OJT'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
