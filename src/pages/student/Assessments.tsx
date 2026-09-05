import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ClipboardList, Loader2, MessageSquareQuote } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import {
  apiGetMySkillAssessments,
  FRAMEWORK_PARAMETERS,
  FRAMEWORK_DIMENSIONS,
  CURRENT_FRAMEWORK_VERSION,
  MAX_RATING,
  RATING_LEVELS,
  type ApiMyAssessment,
} from '../../lib/api/skillAssessments';
import { apiListMyCohorts } from '../../lib/api';
import { getCohortLabel, buildCohortOptions } from '../../lib/cohortLabel';
import type { Cohort } from '../../lib/types';
import { useToast } from '../../toast';
import { formatInIST } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';

/**
 * A student's own view of their assessments, scoped to one OJT at a time.
 *
 * Two things this page is deliberately built around:
 *
 * 1. It is OJT-specific, not a lifetime feed. A student can be a member of
 *    more than one OJT over time (GET /cohorts/mine, same endpoint the
 *    mentor workspace uses to switch OJTs), and each OJT's assessments are
 *    their own — a rating from a finished OJT should not silently blend into
 *    a different one just because both happen to average out on a 1-5 scale.
 *    The picker below only appears once there is a real second OJT to
 *    switch to; one OJT still names itself, just without a control.
 *
 * 2. What a student sees is one number and their mentor's words. What they
 *    are judged on is spelled out in full, but how they scored on each
 *    dimension and parameter is not shown, and is not even in the response:
 *    the backend narrows a student's own read (see StudentVisibleAssessment
 *    on the service). That is the whole reason this page cannot simply
 *    render ApiSkillAssessment with some fields left out.
 */

/** Parameter definitions by key, so a dimension names its own without rescanning the list per row. */
const PARAMETER_BY_KEY = new Map(FRAMEWORK_PARAMETERS.map((parameter) => [parameter.key, parameter]));

const ratingDate = (isoTimestamp: string) =>
  formatInIST(isoTimestamp, { day: '2-digit', month: 'short', year: 'numeric' });

/** The headline: the one figure a student is given, and where it sits on the scale. */
function OverallRating({ assessment }: { assessment: ApiMyAssessment }) {
  const isEarlierRubric = assessment.frameworkVersion !== CURRENT_FRAMEWORK_VERSION;
  const positionOnScale = assessment.finalRating === null ? 0 : (assessment.finalRating / MAX_RATING) * 100;

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Overall rating</p>
      <p className="text-5xl font-bold text-gold tabular-nums mt-1.5">
        {assessment.finalRating === null ? '—' : assessment.finalRating.toFixed(2)}
        <span className="text-xl text-gray-500 font-normal"> / {MAX_RATING}</span>
      </p>

      <div className="h-2 rounded-full bg-zinc-750 overflow-hidden mt-4">
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${positionOnScale}%` }} />
      </div>

      <p className="text-[11px] text-gray-500 mt-2.5">
        Rated {ratingDate(assessment.assessedAt)}
        {assessment.mentorName ? ` by ${assessment.mentorName}` : ''}
      </p>

      {isEarlierRubric && (
        <p className="text-[11px] text-gray-500 mt-2 border-t border-zinc-800 pt-2.5">
          Recorded under an earlier rubric that rated a different set of nine areas, so it is not directly comparable
          to a rating from the framework below.
        </p>
      )}
    </div>
  );
}

/** The mentor's own words — half of what a student gets from this page. */
function MentorFeedback({ note, mentorName }: { note: string | null; mentorName: string | null }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium flex items-center gap-1.5 mb-2">
        <MessageSquareQuote size={13} />
        Feedback from {mentorName ?? 'your mentor'}
      </p>
      {note ? (
        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{note}</p>
      ) : (
        <p className="text-sm text-gray-500 leading-relaxed">
          No written feedback on this one. Ask your mentor about it in your next session.
        </p>
      )}
    </div>
  );
}

/** Previous snapshots in this OJT — the trend, again as final ratings only. */
function EarlierAssessments({ assessments }: { assessments: ApiMyAssessment[] }) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-3">Earlier assessments in this OJT</p>
      <div className="space-y-2">
        {assessments.map((assessment) => (
          <div
            key={assessment.id}
            className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5"
          >
            <span className="text-xs text-gray-400">
              {ratingDate(assessment.assessedAt)}
              {assessment.mentorName ? ` · ${assessment.mentorName}` : ''}
              {assessment.frameworkVersion !== CURRENT_FRAMEWORK_VERSION && (
                <span className="ml-1.5 text-gray-600">· earlier rubric</span>
              )}
            </span>
            <span className="text-xs font-semibold text-white tabular-nums shrink-0">
              {assessment.finalRating === null ? '—' : assessment.finalRating.toFixed(2)} / {MAX_RATING}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The rubric itself, and what the scale means — reference material, not a
 * result. Collapsed by default and visually separate from everything above:
 * the page's first screenful should be "how am I doing", not an explainer.
 * Same collapse pattern as the mentor panel's "All ten parameters".
 */
function AboutTheFramework() {
  return (
    <details className="group bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <summary className="text-xs text-gray-400 uppercase tracking-wider font-medium cursor-pointer list-none flex items-center gap-1.5">
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
        How this framework works
      </summary>

      <div className="mt-4 space-y-5">
        <p className="text-xs text-gray-500 leading-relaxed">
          Your mentor rates ten parameters, grouped into the three capability dimensions below. Each dimension is the
          average of its own parameters, and your overall rating is the average of the three dimensions.
        </p>

        {FRAMEWORK_DIMENSIONS.map((dimension) => (
          <div key={dimension.key} className="border-t border-zinc-800 pt-4">
            <p className="text-sm font-semibold text-white">{dimension.label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{dimension.guidingQuestion}</p>

            <ul className="mt-3 space-y-2.5">
              {dimension.parameters.map((parameterKey) => {
                const parameter = PARAMETER_BY_KEY.get(parameterKey);
                if (!parameter) return null;
                return (
                  <li key={parameterKey} className="border-l-2 border-zinc-750 pl-3">
                    <p className="text-xs text-gray-300">{parameter.label}</p>
                    <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{parameter.guidingQuestion}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-2.5">What the ratings mean</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {RATING_LEVELS.map((level) => (
              <p key={level.value} className="text-[11px] text-gray-500">
                <span className="text-gray-300 font-semibold">
                  {level.value} — {level.label}
                </span>{' '}
                {level.description}
              </p>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

export default function StudentAssessments() {
  const { showError } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<ApiMyAssessment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssessments = useCallback(
    async (cohortId: string) => {
      setLoading(true);
      try {
        const res = await apiGetMySkillAssessments({ cohortId, page: 1, limit: 20 });
        setAssessments(res.data);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load your assessments');
      } finally {
        setLoading(false);
      }
    },
    [showError]
  );

  // One combined load: which OJTs the student has ever been part of, then the
  // assessments for whichever one comes up as the default. Doing this as two
  // independent effects would fetch assessments once for "no OJT yet" and
  // again the instant the default OJT resolves — a visible flash from empty
  // to populated on every page load.
  const init = useCallback(async () => {
    setLoading(true);
    try {
      const myCohorts = await apiListMyCohorts();
      setCohorts(myCohorts);

      const active = myCohorts.find((c) => c.isActive);
      const mostRecent = [...myCohorts].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
      const defaultCohortId = (active ?? mostRecent)?.id ?? null;
      setSelectedCohortId(defaultCohortId);

      if (defaultCohortId) {
        await loadAssessments(defaultCohortId);
      } else {
        setAssessments([]);
        setLoading(false);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your OJTs');
      setLoading(false);
    }
  }, [loadAssessments, showError]);

  useEffect(() => {
    init();
  }, [init]);

  usePageRefresh(init);

  const handleCohortChange = (cohortId: string) => {
    setSelectedCohortId(cohortId);
    loadAssessments(cohortId);
  };

  const cohortOptions = useMemo(() => buildCohortOptions(cohorts), [cohorts]);
  const selectedCohort = cohorts.find((c) => c.id === selectedCohortId) ?? null;

  const latest = assessments[0] ?? null;
  const earlier = assessments.slice(1);

  return (
    <PageLayout className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={22} className="text-gold" />
            My Assessments
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            How your mentor reads your capability as a junior engineer, and what to work on next.
          </p>
        </div>

        {/* Only worth a control once there is a real second OJT to switch to
            — most students only ever have one, and a single-option dropdown
            would just be a label pretending to be a choice. */}
        {cohortOptions.length > 1 ? (
          <Select
            variant="filter"
            value={selectedCohortId ?? ''}
            onChange={handleCohortChange}
            options={cohortOptions}
            placeholder="Select OJT"
            className="w-56"
          />
        ) : (
          selectedCohort && (
            <span className="text-xs text-gray-400 bg-zinc-850 border border-zinc-750 rounded-lg px-3 py-1.5">
              {getCohortLabel(selectedCohort)}
            </span>
          )
        )}
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      ) : !selectedCohortId ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-300">You’re not part of an OJT yet.</p>
          <p className="text-xs text-gray-500 mt-1.5">Your assessments will appear here once you join one.</p>
        </div>
      ) : (
        <>
          {latest ? (
            <>
              <OverallRating assessment={latest} />
              <MentorFeedback note={latest.note} mentorName={latest.mentorName} />
              {earlier.length > 0 && <EarlierAssessments assessments={earlier} />}
            </>
          ) : (
            <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-center">
              <p className="text-sm text-gray-300">
                Your mentor hasn’t assessed you yet in {selectedCohort ? getCohortLabel(selectedCohort) : 'this OJT'}.
              </p>
              <p className="text-xs text-gray-500 mt-1.5">
                Your rating appears here once they record one — it’s based on your actual OJT work.
              </p>
            </div>
          )}

          <AboutTheFramework />
        </>
      )}
    </PageLayout>
  );
}
