/**
 * A team's submitted preferences, in slot order, with a slot it never filled
 * left out.
 *
 * `preference_2_id` is nullable in the schema — a track whose
 * `allowed_submission_modes` are '1_own'/'1_recommended' takes a single
 * preference, and 15 Open Source teams on the live cohort submitted exactly
 * that. The API still returns a `preference2` object for them with every field
 * null, so rendering `[preference1, preference2]` gave those teams a blank,
 * clickable "Preference 2" card that failed the endpoint's UUID validation the
 * moment it was pressed.
 *
 * The slot number travels with the preference rather than being the array
 * index, so a dropped slot never renumbers the ones that remain.
 */
export interface PreferenceSlotLike {
  projectId: string | null;
  projectTitle: string | null;
  mentorId: string | null;
  mentorName: string | null;
}

export interface SubmittedPreference<T extends PreferenceSlotLike> {
  pref: T & { projectId: string };
  slot: number;
}

export function submittedPreferences<T extends PreferenceSlotLike>(
  preference1: T,
  preference2: T
): SubmittedPreference<T>[] {
  return [preference1, preference2]
    .map((pref, index) => ({ pref, slot: index + 1 }))
    .filter((entry): entry is SubmittedPreference<T> => !!entry.pref.projectId);
}

/**
 * Which of a team's preference slots its allocation came from, if either.
 *
 * Guards on the allocation existing first. Comparing `allocatedProjectId`
 * against the slots directly reported slot 2 for every unallocated
 * single-preference team, because both sides were null and null === null.
 */
export function allocatedPreferenceSlot(
  allocatedProjectId: string | null,
  preference1: PreferenceSlotLike,
  preference2: PreferenceSlotLike
): 1 | 2 | null {
  if (!allocatedProjectId) return null;
  if (allocatedProjectId === preference1.projectId) return 1;
  if (allocatedProjectId === preference2.projectId) return 2;
  return null;
}
