import type { ApiSessionStatus } from './api/sessions';

/**
 * A session's `location_or_link` is one free-text field holding two different
 * kinds of thing: a meeting URL, or a physical place ("Room 204", "Lab 3").
 * Mentors type whichever applies, and nothing in the form makes them choose,
 * so this is where the two get told apart.
 *
 * Kept pure and out of the component because three pages render this field and
 * a hover card shows a fourth copy — the classification has to be identical in
 * all of them, and a rule that lives inside one component is a rule the other
 * three will eventually disagree with.
 */

/** How long before a session starts the join affordance becomes the primary one. */
export const JOIN_WINDOW_OPENS_MINUTES = 10;

export type SessionLocationKind =
  /** A meeting URL — joinable. */
  | 'link'
  /** A physical place, or anything we cannot read as a URL. */
  | 'place'
  /** Nothing recorded. */
  | 'none';

export interface SessionLocation {
  kind: SessionLocationKind;
  /** The text exactly as the mentor typed it — always what gets displayed. */
  label: string;
  /** Absolute, scheme-qualified URL to open. Only set when kind is 'link'. */
  href?: string;
}

/**
 * Bare hosts like `meet.google.com/abc-defg` are what people actually paste,
 * so a missing scheme cannot mean "not a link". A place name is separated from
 * a bare host by two things a host never has: whitespace, and no dot at all.
 * That leaves "Room 204" and "Lab 3" as places, which is the point.
 */
const BARE_HOST = /^[^\s/]+\.[^\s/]{2,}(\/\S*)?$/;

export function classifySessionLocation(raw: string | null | undefined): SessionLocation {
  const label = (raw ?? '').trim();
  if (!label) return { kind: 'none', label: '' };

  if (/^https?:\/\//i.test(label)) {
    try {
      // Rejects the malformed leftovers of a half-pasted URL, which would
      // otherwise render a "Join now" button that goes nowhere.
      const url = new URL(label);
      return { kind: 'link', label, href: url.toString() };
    } catch {
      return { kind: 'place', label };
    }
  }

  // Anything else with a scheme is deliberately not a link: mailto:, tel: and
  // file: are not somewhere a session happens, and javascript: is an attack.
  if (/^[a-z][a-z0-9+.-]*:/i.test(label)) return { kind: 'place', label };

  if (BARE_HOST.test(label)) return { kind: 'link', label, href: `https://${label}` };

  return { kind: 'place', label };
}

/**
 * Whether this session is one you could join right now.
 *
 * A cancelled or completed session is never joinable — offering a way into a
 * meeting that is off, or over, is worse than offering nothing. Otherwise the
 * window runs from a few minutes before the start until the scheduled end,
 * which is what makes exactly one row on a list of sessions the live one.
 *
 * Outside the window a link stays openable, just not emphasised: people
 * legitimately click through early to check a link works.
 */
export function isJoinable(status: ApiSessionStatus): boolean {
  return status === 'scheduled' || status === 'rescheduled';
}

export function isWithinJoinWindow(startTime: string, endTime: string, now: Date = new Date()): boolean {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return now.getTime() >= start - JOIN_WINDOW_OPENS_MINUTES * 60_000 && now.getTime() <= end;
}

/**
 * PST Campus's physical rooms, for the "pick a room" quick-fill next to the
 * Location / Link field — floor by floor, ground floor first. This is a
 * fixed convenience list, not the only thing the field accepts: a mentor
 * hosting elsewhere still pastes a link or types a room this list doesn't
 * have, and the plain text input underneath still takes that.
 */
export const PST_CAMPUS_ROOM_OPTIONS: { value: string; label: string }[] = [
  { value: 'PST Campus Ground Floor RC', label: 'PST Campus Ground Floor RC' },
  { value: 'PST Campus Floor 1 CR1', label: 'PST Campus Floor 1 CR1' },
  { value: 'PST Campus Floor 1 CR2', label: 'PST Campus Floor 1 CR2' },
  { value: 'PST Campus Floor 1 CR3', label: 'PST Campus Floor 1 CR3' },
  { value: 'PST Campus Floor 1 CR4', label: 'PST Campus Floor 1 CR4' },
  { value: 'PST Campus Floor 1 Cohort-1', label: 'PST Campus Floor 1 Cohort-1' },
  { value: 'PST Campus Floor 1 Cohort-2', label: 'PST Campus Floor 1 Cohort-2' },
  { value: 'PST Campus Floor 1 Cohort-3', label: 'PST Campus Floor 1 Cohort-3' },
  { value: 'PST Campus Floor 1 Cohort-4', label: 'PST Campus Floor 1 Cohort-4' },
  { value: 'PST Campus Floor 1 Cohort-5', label: 'PST Campus Floor 1 Cohort-5' },
  { value: 'PST Campus Floor 2 Cohort-1', label: 'PST Campus Floor 2 Cohort-1' },
  { value: 'PST Campus Floor 2 Cohort-2', label: 'PST Campus Floor 2 Cohort-2' },
];

/** The room a new session's Location field starts on, until changed. */
export const DEFAULT_SESSION_LOCATION = 'PST Campus Floor 1 Cohort-5';

/** A new session's Title field starts on this, until edited. */
export function defaultSessionTitle(mentorFullName: string | null | undefined): string {
  return `OJT Session with ${mentorFullName || 'Mentor'}`;
}
