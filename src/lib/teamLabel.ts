/** The minimum a member has to carry to be named in a team label. */
export interface LabellableTeamMember {
  fullName: string | null;
  batch: string | null;
}

/**
 * A team written as who is on it: "Rahul_2025 A, Priya_2025 A".
 *
 * Complements ojt_teams.name rather than replacing it — that field is populated
 * ("G1", "G2", …) on production and is how mentors and ops refer to a team, but
 * a group number says nothing about who is in the group. Callers that have both
 * generally want both.
 *
 * The batch rides on each name because two students sharing a first name across
 * sections is common enough that the name alone is not an identifier.
 *
 * Returns an empty string for a team with nobody on it, so callers decide what
 * "no team" looks like in their own column rather than inheriting a placeholder.
 */
export function formatTeamMembers(members: LabellableTeamMember[]): string {
  return members
    .map((member) => `${member.fullName ?? 'Unknown'}_${member.batch ?? '?'}`)
    .join(', ');
}
