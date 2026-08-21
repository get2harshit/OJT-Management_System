// Shared by any screen that shows a mentor group's recurring meeting
// pattern (Mentor Workspace's group headers, the session-creation group
// picker) — one formatting rule so "Mon, Wed, Fri" reads the same everywhere.
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_OPTIONS = DAY_LABELS.map((label, value) => ({ value: String(value), label }));

interface GroupWithPattern {
  meeting_pattern_type: 'weekdays' | 'interval' | null;
  meeting_weekdays: number[];
  meeting_interval_days: number | null;
}

// Purely a display label — the pattern itself never drives auto-scheduling,
// it's a default for cadence targets and a suggestion in the UI.
export function formatMeetingPattern(group: GroupWithPattern): string | null {
  if (group.meeting_pattern_type === 'weekdays' && group.meeting_weekdays.length > 0) {
    return [...group.meeting_weekdays].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(', ');
  }
  if (group.meeting_pattern_type === 'interval' && group.meeting_interval_days) {
    return group.meeting_interval_days === 1 ? 'Every day' : `Every ${group.meeting_interval_days} days`;
  }
  return null;
}
