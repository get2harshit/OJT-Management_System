import type { SemesterSession } from './types';

export const TRACKS = ['Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'];

// Shared dot-indicator colors so the same track always reads the same color
// everywhere it shows up (mentor list, project/mentor selection grids, etc.)
// instead of every chip defaulting to the same gold and blurring together.
export const TRACK_DOT_COLORS: Record<string, { dot: string; text: string }> = {
  'Product Development': { dot: 'bg-blue-400', text: 'text-blue-400' },
  'Application Development': { dot: 'bg-purple-400', text: 'text-purple-400' },
  'Data Scientist': { dot: 'bg-teal-400', text: 'text-teal-400' },
  'Open Source': { dot: 'bg-orange-400', text: 'text-orange-400' },
  'Gen AI': { dot: 'bg-pink-400', text: 'text-pink-400' },
};

export const MENTOR_TYPE_DOT_COLORS: Record<string, { dot: string; text: string }> = {
  Internal: { dot: 'bg-gold', text: 'text-gold' },
  External: { dot: 'bg-blue-400', text: 'text-blue-400' },
};

export const SEMESTER_SESSION_OPTIONS: SemesterSession[] = ['ODD', 'EVEN'];

export const SEMESTER_SESSION_LABELS: Record<SemesterSession, string> = {
  'ODD': 'Odd',
  'EVEN': 'Even',
};
