import { Eye } from 'lucide-react';

interface ViewOnlyBannerProps {
  /** The mentor whose data is being viewed, e.g. "Priya Sharma". */
  mentorName: string | null;
}

/**
 * Shown wherever a page is rendering another mentor's data via an
 * admin-granted view (asMentorId) — mirrors the amber "admin has view-only
 * access" banner in admin/Submissions.tsx. Pages showing this must also hide
 * their own action buttons (approve/reject/create/assign) for the duration;
 * the banner alone is a UI courtesy, not the actual access control — that
 * lives entirely server-side (see mentorViewGrants.ts).
 */
export default function ViewOnlyBanner({ mentorName }: ViewOnlyBannerProps) {
  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-lg px-4 py-2.5">
      <Eye size={16} className="shrink-0" />
      <span>
        You&apos;re viewing <span className="font-semibold">{mentorName ?? 'this mentor'}</span>&apos;s data via an
        admin-granted share — this is view-only.
      </span>
    </div>
  );
}
