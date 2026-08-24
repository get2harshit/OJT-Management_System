import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type {
  ApiNoShowStudent,
  ApiReportProjectStatus,
  ApiReportTeamHealth,
  ApiWeeklyReportSummary,
  ApiWeeklyReportTeam,
} from '../lib/api/tasks';

const PROJECT_STATUS_OPTIONS: { value: ApiReportProjectStatus; label: string }[] = [
  { value: 'on_track', label: 'On track' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'ahead', label: 'Ahead' },
];

const TEAM_HEALTH_OPTIONS: { value: ApiReportTeamHealth; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

const RATING_VALUES = [0, 1, 2, 3, 4, 5];

const PROJECT_STATUS_TONE: Record<ApiReportProjectStatus, string> = {
  on_track: 'text-green-400',
  delayed: 'text-red-400',
  ahead: 'text-blue-400',
};

const TEAM_HEALTH_TONE: Record<ApiReportTeamHealth, string> = {
  positive: 'text-green-400',
  neutral: 'text-gray-300',
  negative: 'text-red-400',
};

/**
 * The strip across the top of the report: how many teams, how many of them
 * were on track each week so far, and how many students went missing this
 * week. Rendered from the server's own numbers — nothing here is counted
 * client-side, so the mentor's view and the admin's cannot drift apart.
 */
export function WeeklyReportSummaryStrip({ summary }: { summary: ApiWeeklyReportSummary }) {
  return (
    <div className="flex flex-wrap gap-3">
      <SummaryCard label="Teams" value={String(summary.teamCount)} hint={`${summary.studentCount} students`} />
      {summary.weeks.map((week) => (
        <SummaryCard
          key={week.week}
          label={`${week.label} on track`}
          value={`${week.onTrack}/${week.total}`}
          hint="all tasks in"
          // Only the shortfall is worth colouring — a full week is the
          // expected state and does not need to shout.
          tone={week.onTrack < week.total ? 'text-amber-400' : undefined}
        />
      ))}
      <NoShowCard students={summary.noShowStudents} />
      {/* Its own card, not squeezed into the count card above — a handful
          of names fits fine there, but a bad week could mean a dozen, and a
          fixed-width card packed with that many names is how a summary
          strip breaks. This one wraps its own chips and scrolls internally
          instead of growing the whole strip. */}
      {summary.noShowStudents.length > 0 && <NoShowNamesCard students={summary.noShowStudents} />}
    </div>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3 min-w-[130px]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${tone ?? 'text-white'}`}>{value}</p>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

// Same fixed shape as every other card in the strip — just the number, so
// the row of cards stays a row of numbers to scan, not one of them suddenly
// wider than the rest.
function NoShowCard({ students }: { students: ApiNoShowStudent[] }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3 min-w-[130px]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">No-show students</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 ${students.length > 0 ? 'text-red-400' : 'text-white'}`}>
        {students.length}
      </p>
      {students.length === 0 && <p className="text-[10px] text-gray-600 mt-0.5">absent this week</p>}
    </div>
  );
}

// Who, separately — bounded so it can never be the thing that breaks the
// strip's layout. Chips wrap inside a capped height rather than the card
// growing tall with the list, and the card's own max-width keeps one bad
// week from stretching across the screen; overflow inside both directions
// scrolls, never the page.
function NoShowNamesCard({ students }: { students: ApiNoShowStudent[] }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3 min-w-[180px] max-w-[420px]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Who</p>
      <div className="flex flex-wrap gap-1 max-h-[68px] overflow-y-auto scrollbar-thin pr-0.5">
        {students.map((s) => (
          <span
            key={s.studentId}
            className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-300 whitespace-nowrap"
          >
            {s.name}
            {s.batch && <span className="text-red-400/70">{` · ${s.batch}`}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A bare <select> rather than the app's Select component, on purpose: this
 * grid puts one control in every cell of a wide, scrollable table, and
 * Select renders its menu through a portal anchored to the trigger — which
 * detaches from the cell the moment the table scrolls sideways underneath
 * an open menu. A native select stays with its cell.
 */
function CellSelect<T extends string>({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  tone,
  className = '',
}: {
  value: T | null;
  onChange: (value: T | null) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  placeholder: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange((e.target.value === '' ? null : (e.target.value as T)))}
        className={`w-full appearance-none bg-zinc-900 border border-zinc-750 rounded-lg pl-2.5 pr-7 py-1.5 text-xs focus:outline-none focus:border-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          value ? tone ?? 'text-white' : 'text-gray-500'
        } ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-white bg-zinc-900">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
  );
}

export interface WeeklyReportGridChange {
  teamId: string;
  projectStatus?: ApiReportProjectStatus | null;
  teamHealth?: ApiReportTeamHealth | null;
  weeklyFeedback?: string | null;
  techStack?: string[];
  student?: {
    studentId: string;
    field: 'techSkill' | 'communication' | 'overallPerformance';
    value: number | null;
  };
}

/**
 * The report itself, laid out the way it was drawn: one row per student,
 * with everything that belongs to the team (track, project, status, health,
 * feedback) spanning that team's rows instead of repeating down them.
 *
 * `readOnly` is what the admin's aggregate view uses — same grid, same
 * column order, no editing. Two renderings of one table would be two things
 * to keep in step.
 */
export default function WeeklyReportGrid({
  teams,
  readOnly = false,
  onChange,
}: {
  teams: ApiWeeklyReportTeam[];
  readOnly?: boolean;
  onChange?: (change: WeeklyReportGridChange) => void;
}) {
  if (teams.length === 0) {
    return (
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">No teams to report on.</p>
        <p className="text-xs text-gray-600 mt-1">
          Teams appear here once students are allocated to you in this OJT.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
      {/* The grid is genuinely wide — ten columns with controls in them.
          Scrolling it inside its own container keeps the page from
          scrolling sideways as a whole. */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1440px] border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-900 border-b border-zinc-750">
              <Th className="w-[140px]">Team</Th>
              <Th className="w-[180px]">Student</Th>
              <Th className="w-[120px]">Track</Th>
              <Th className="w-[200px]">Project</Th>
              <Th className="w-[130px]">Project status</Th>
              <Th className="w-[160px]">Tech stack</Th>
              <Th className="w-[90px]" align="center">Tech skill</Th>
              <Th className="w-[110px]" align="center">Communication</Th>
              <Th className="w-[110px]" align="center">Overall OJT</Th>
              <Th className="w-[260px]">Weekly feedback</Th>
              <Th className="w-[120px]">Team health</Th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, teamIndex) => {
              // A team with no members still gets one row, so it is visible
              // and reportable rather than silently missing from the grid.
              const rows = team.students.length > 0 ? team.students : [null];
              // A team that has moved to another mentor is kept on screen so
              // the week the mentor reported on still reads as reported —
              // but it is theirs to look at, not to change. The server
              // refuses writes to it either way.
              const teamLocked = readOnly || team.isFormerTeam === true;
              return rows.map((student, studentIndex) => (
                <tr
                  key={`${team.teamId}-${student?.studentId ?? 'empty'}`}
                  className={`border-b border-zinc-800 ${teamIndex % 2 === 1 ? 'bg-zinc-900/30' : ''}`}
                >
                  {studentIndex === 0 && (
                    <>
                      <Td rowSpan={rows.length} className="align-top font-medium text-white">
                        {team.teamName}
                        {team.isFormerTeam && (
                          <span className="block text-[10px] font-normal text-amber-400/80 mt-0.5">
                            Moved to another mentor
                          </span>
                        )}
                      </Td>
                    </>
                  )}
                  <Td className="text-gray-200">
                    {student ? (
                      <>
                        <span className="block truncate" title={student.name}>{student.name}</span>
                        {student.registrationNumber && (
                          <span className="block text-[10px] text-gray-600">{student.registrationNumber}</span>
                        )}
                        {student.isFormerMember && (
                          <span className="block text-[10px] text-amber-400/80">No longer on this team</span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-600 italic">No members</span>
                    )}
                  </Td>
                  {studentIndex === 0 && (
                    <>
                      <Td rowSpan={rows.length} className="align-top text-gray-400">{team.trackName}</Td>
                      <Td rowSpan={rows.length} className="align-top text-gray-400">
                        {team.projectTitle ? (
                          <span className="block line-clamp-2" title={team.projectTitle}>{team.projectTitle}</span>
                        ) : (
                          <span className="text-gray-600 italic">Not allocated</span>
                        )}
                      </Td>
                      <Td rowSpan={rows.length} className="align-top">
                        {teamLocked ? (
                          <ReadOnlyValue
                            value={PROJECT_STATUS_OPTIONS.find((o) => o.value === team.projectStatus)?.label}
                            tone={team.projectStatus ? PROJECT_STATUS_TONE[team.projectStatus] : undefined}
                          />
                        ) : (
                          <CellSelect
                            value={team.projectStatus}
                            options={PROJECT_STATUS_OPTIONS}
                            placeholder="Select"
                            tone={team.projectStatus ? PROJECT_STATUS_TONE[team.projectStatus] : undefined}
                            onChange={(value) => onChange?.({ teamId: team.teamId, projectStatus: value })}
                          />
                        )}
                      </Td>
                      <TechStackCell
                        rowSpan={rows.length}
                        value={team.techStack}
                        disabled={teamLocked}
                        onChange={(value) => onChange?.({ teamId: team.teamId, techStack: value })}
                      />
                    </>
                  )}
                  <RatingCell
                    value={student?.techSkill ?? null}
                    disabled={teamLocked || !student || student.isFormerMember === true}
                    onChange={(value) =>
                      student && onChange?.({ teamId: team.teamId, student: { studentId: student.studentId, field: 'techSkill', value } })
                    }
                  />
                  <RatingCell
                    value={student?.communication ?? null}
                    disabled={teamLocked || !student || student.isFormerMember === true}
                    onChange={(value) =>
                      student && onChange?.({ teamId: team.teamId, student: { studentId: student.studentId, field: 'communication', value } })
                    }
                  />
                  <RatingCell
                    value={student?.overallPerformance ?? null}
                    disabled={teamLocked || !student || student.isFormerMember === true}
                    onChange={(value) =>
                      student && onChange?.({ teamId: team.teamId, student: { studentId: student.studentId, field: 'overallPerformance', value } })
                    }
                  />
                  {studentIndex === 0 && (
                    <>
                      <Td rowSpan={rows.length} className="align-top">
                        {teamLocked ? (
                          <p className="text-xs text-gray-300 whitespace-pre-wrap">
                            {team.weeklyFeedback?.trim() || <span className="text-gray-600 italic">No feedback</span>}
                          </p>
                        ) : (
                          <textarea
                            defaultValue={team.weeklyFeedback ?? ''}
                            rows={Math.min(Math.max(rows.length, 2), 5)}
                            maxLength={4000}
                            placeholder="How did this team's week go?"
                            // onBlur, not onChange: this is the one free-text
                            // field in the grid, and saving per keystroke
                            // would be a request per character. Uncontrolled
                            // (defaultValue) for the same reason — a
                            // controlled value re-rendered from the server's
                            // reply would move the caret mid-sentence.
                            onBlur={(e) =>
                              onChange?.({ teamId: team.teamId, weeklyFeedback: e.target.value.trim() === '' ? null : e.target.value })
                            }
                            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-gold transition-colors resize-none placeholder-gray-600"
                          />
                        )}
                      </Td>
                      <Td rowSpan={rows.length} className="align-top">
                        {teamLocked ? (
                          <ReadOnlyValue
                            value={TEAM_HEALTH_OPTIONS.find((o) => o.value === team.teamHealth)?.label}
                            tone={team.teamHealth ? TEAM_HEALTH_TONE[team.teamHealth] : undefined}
                          />
                        ) : (
                          <CellSelect
                            value={team.teamHealth}
                            options={TEAM_HEALTH_OPTIONS}
                            placeholder="Select"
                            tone={team.teamHealth ? TEAM_HEALTH_TONE[team.teamHealth] : undefined}
                            onChange={(value) => onChange?.({ teamId: team.teamId, teamHealth: value })}
                          />
                        )}
                      </Td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '', align = 'left' }: { children: React.ReactNode; className?: string; align?: 'left' | 'center' }) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '', rowSpan }: { children: React.ReactNode; className?: string; rowSpan?: number }) {
  return (
    <td rowSpan={rowSpan} className={`px-3 py-2 border-r border-zinc-800 last:border-r-0 ${className}`}>
      {children}
    </td>
  );
}

function ReadOnlyValue({ value, tone }: { value?: string; tone?: string }) {
  if (!value) return <span className="text-xs text-gray-600 italic">Not set</span>;
  return <span className={`text-xs font-medium ${tone ?? 'text-gray-300'}`}>{value}</span>;
}

// One list per team, not per student — everyone on a team works the same
// project, so a per-student stack would just be the same list typed twice.
// Rendered next to Project/Project status, spanning the team's rows the
// same way those do.
//
// Free entries, typed one at a time — Enter or comma commits the current
// text as a chip, Backspace on an empty box removes the last one. Not the
// app's Select (nothing to pick from) and not a plain text input — the
// point is that each entry shows and can be removed on its own, a set of
// chips rather than one string a reader has to re-split themselves.
function TechStackCell({
  value,
  disabled,
  onChange,
  rowSpan,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
  rowSpan?: number;
}) {
  const [draft, setDraft] = useState('');

  if (disabled) {
    return (
      <Td rowSpan={rowSpan} className="align-top">
        {value.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {value.map((item) => (
              <span key={item} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-gray-300">
                {item}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-600 italic">Not set</span>
        )}
      </Td>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    setDraft('');
    if (!trimmed || value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
  };

  return (
    <Td rowSpan={rowSpan} className="align-top">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gold/10 border border-gold/25 text-gold"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== item))}
                aria-label={`Remove ${item}`}
                className="hover:text-white transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder="Add, Enter"
        className="w-full bg-zinc-900 border border-zinc-750 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-gold transition-colors placeholder-gray-600"
      />
    </Td>
  );
}

function RatingCell({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  if (disabled) {
    return (
      <Td className="text-center">
        {value === null ? (
          <span className="text-xs text-gray-600">&mdash;</span>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
        )}
      </Td>
    );
  }
  return (
    <Td>
      <CellSelect
        value={value === null ? null : String(value)}
        options={RATING_VALUES.map((n) => ({ value: String(n), label: String(n) }))}
        placeholder="&mdash;"
        className="text-center pl-2 pr-6"
        onChange={(next) => onChange(next === null ? null : Number(next))}
      />
    </Td>
  );
}
