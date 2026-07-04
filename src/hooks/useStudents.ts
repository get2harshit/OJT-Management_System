import { useMemo } from 'react';
import type { Profile } from '../lib/types';

export function useStudentProfiles(profiles: Profile[]): Profile[] {
  return useMemo(() => profiles.filter(p => p.role === 'STUDENT'), [profiles]);
}
