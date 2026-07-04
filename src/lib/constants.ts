import type { SemesterSession } from './types';

export const TRACKS = ['Product Development', 'Application Development', 'Data Scientist', 'Open Source', 'Gen AI'];

export const SEMESTER_SESSION_OPTIONS: SemesterSession[] = ['ODD', 'EVEN'];

export const SEMESTER_SESSION_LABELS: Record<SemesterSession, string> = {
  'ODD': 'Odd',
  'EVEN': 'Even',
};
