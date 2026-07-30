import type { SemesterSession } from './types';

// Tracks are admin-managed now (fetched via useTracks / apiListTracks), not a
// fixed list — see src/hooks/useTracks.ts and src/lib/api/tracks.ts.

// A fixed palette cycled by a hash of the track's slug, so a given track
// always renders the same color everywhere (mentor list, project/mentor
// selection grids, etc.) without a hardcoded per-track lookup table — new
// tracks get a color automatically instead of falling back to a single
// generic shade.
const TRACK_COLOR_PALETTE: { dot: string; text: string }[] = [
  { dot: 'bg-blue-400', text: 'text-blue-400' },
  { dot: 'bg-purple-400', text: 'text-purple-400' },
  { dot: 'bg-teal-400', text: 'text-teal-400' },
  { dot: 'bg-orange-400', text: 'text-orange-400' },
  { dot: 'bg-pink-400', text: 'text-pink-400' },
  { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  { dot: 'bg-cyan-400', text: 'text-cyan-400' },
  { dot: 'bg-amber-400', text: 'text-amber-400' },
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Pass the track SLUG (stable identifier) — not the display name, which can
// be renamed without changing which color a track keeps.
export function getTrackColor(trackSlug: string | null | undefined): { dot: string; text: string } {
  if (!trackSlug) return { dot: 'bg-gray-400', text: 'text-gray-400' };
  const index = hashString(trackSlug) % TRACK_COLOR_PALETTE.length;
  return TRACK_COLOR_PALETTE[index];
}

export const MENTOR_TYPE_DOT_COLORS: Record<string, { dot: string; text: string }> = {
  Internal: { dot: 'bg-gold', text: 'text-gold' },
  External: { dot: 'bg-blue-400', text: 'text-blue-400' },
};

export const SEMESTER_SESSION_OPTIONS: SemesterSession[] = ['ODD', 'EVEN'];

export const SEMESTER_SESSION_LABELS: Record<SemesterSession, string> = {
  'ODD': 'Odd',
  'EVEN': 'Even',
};
