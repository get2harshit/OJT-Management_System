import { useMemo } from 'react';
import type { Profile } from '../lib/types';

export function useMentors(profiles: Profile[]): Profile[] {
  return useMemo(() => profiles.filter(p => p.role === 'MENTOR'), [profiles]);
}
