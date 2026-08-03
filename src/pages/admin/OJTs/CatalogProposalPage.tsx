import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Check, Plus, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import { apiGetCohort, apiGetCatalogProposal, apiApplyCatalogProposal } from '../../../lib/api';
import type { CatalogProposal, ApplyCatalogAction, ProposalMentor } from '../../../lib/api/tracks';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

// Reached from Track Configuration. Shows what the imported project catalog
// says this OJT's configuration should be, against how it is set up now, and
// lets the admin apply the parts they agree with.
//
// Nothing here writes until something is ticked and applied. That is the whole
// point of the screen: the catalog is a spreadsheet several people edit and it
// carries no project mode or submission options, so it can suggest a
// configuration but never be one. A silent import would let one edited cell
// re-scope who may pick a track, or drop mentors an admin assigned by hand —
// both of which this makes visible first.

/** Stable key for a proposal row — also what identifies a ticked action. */
function keyOf(proposal: CatalogProposal): string {
  return proposal.kind === 'missing_variant'
    ? `create:${proposal.trackId}:${proposal.year}`
    : `${proposal.kind}:${proposal.configId}`;
}

function actionFor(proposal: CatalogProposal): ApplyCatalogAction | null {
  if (proposal.kind === 'missing_variant') {
    return { kind: 'create', trackId: proposal.trackId, year: proposal.year };
  }
  if (proposal.kind === 'roster_differs') return { kind: 'sync_roster', configId: proposal.configId };
  return null;
}

const MentorList = ({ mentors, tone }: { mentors: ProposalMentor[]; tone: 'add' | 'remove' | 'plain' }) => {
  if (mentors.length === 0) return null;
  const color = tone === 'add' ? 'text-emerald-400' : tone === 'remove' ? 'text-red-400' : 'text-gray-400';
  const sign = tone === 'add' ? '+' : tone === 'remove' ? '−' : '';
  return (
    <span className={`${color} text-xs`}>
      {sign}
      {mentors.length} {mentors.map((m) => m.fullName ?? 'unnamed').join(', ')}
    </span>
  );
};

export default function CatalogProposalPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [proposals, setProposals] = useState<CatalogProposal[]>([]);
  const [catalogProjectCount, setCatalogProjectCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    try {
      const [cohort, result] = await Promise.all([
        apiGetCohort(cohortId).catch(() => null),
        apiGetCatalogProposal(cohortId),
      ]);
      if (cohort) setCohortLabel(getCohortLabel(cohort));
      setProposals(result.proposals);
      setCatalogProjectCount(result.catalogProjectCount);
      // Cleared rather than preserved: after an apply the rows have changed
      // meaning, and carrying ticks across would re-apply something already done.
      setSelected(new Set());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to read the catalog');
    } finally {
      setLoaded(true);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePageRefresh(fetchData);

  // Only two kinds are actionable; the other two are there so the admin sees
  // the whole picture rather than only the parts that need a decision.
  const actionable = proposals.filter((p) => p.kind === 'missing_variant' || p.kind === 'roster_differs');
  const informational = proposals.filter((p) => p.kind === 'in_sync' || p.kind === 'no_catalog_projects');

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allSelected = actionable.length > 0 && actionable.every((p) => selected.has(keyOf(p)));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(actionable.map(keyOf)));

  const handleApply = async () => {
    if (!cohortId || selected.size === 0) return;
    const actions = actionable
      .filter((p) => selected.has(keyOf(p)))
      .map(actionFor)
      .filter((a): a is ApplyCatalogAction => a !== null);

    setApplying(true);
    try {
      const result = await apiApplyCatalogProposal(cohortId, actions);
      const parts: string[] = [];
      if (result.created) parts.push(`${result.created} configuration${result.created === 1 ? '' : 's'} created`);
      if (result.rostersUpdated) parts.push(`${result.rostersUpdated} roster${result.rostersUpdated === 1 ? '' : 's'} updated`);
      showSuccess(parts.length ? parts.join(', ') : 'Nothing left to apply');

      // Surfaced separately from the success line: neither is a failure, but
      // both change what the admin ends up with and would otherwise be silent.
      if (result.droppedMentors.length) {
        showError(
          `Left out — not on this OJT: ${result.droppedMentors.join(', ')}. Add them to the OJT, then re-apply.`
        );
      }
      for (const reason of result.skipped) showError(reason);

      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <CohortPageHeader
        title="Configuration from the catalog"
        subtitle={cohortLabel ? `${cohortLabel} · ${catalogProjectCount} imported project(s)` : undefined}
        icon={FileSpreadsheet}
      />

      <div className="text-sm text-gray-400 bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3">
        The catalog says which tracks run for which admission years, and which mentors its projects
        recommend. Nothing below is applied until you tick it — project mode and submission options
        aren't in the catalog at all, so a new configuration starts on the defaults and you can edit it
        afterwards.
      </div>

      {loaded && proposals.length === 0 && (
        <div className="text-sm text-gray-400 bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-6 text-center">
          {catalogProjectCount === 0
            ? 'No projects imported for this OJT yet — upload a catalog first and the configuration can be derived from it.'
            : 'Nothing to propose. Every track the catalog covers is already configured, with matching mentors.'}
        </div>
      )}

      {actionable.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={toggleAll} className="text-sm text-blue-400 font-semibold hover:underline">
            {allSelected ? 'Deselect all' : `Select all ${actionable.length}`}
          </button>
          <button
            onClick={handleApply}
            disabled={selected.size === 0 || applying}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Check size={16} />
            {applying ? 'Applying...' : `Apply ${selected.size} change${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {actionable.map((proposal) => {
          const key = keyOf(proposal);
          const isSelected = selected.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
                isSelected ? 'bg-gold/10 border-gold/40' : 'bg-zinc-850 border-zinc-750 hover:border-zinc-650'
              }`}
            >
              <input
                type="checkbox"
                readOnly
                checked={isSelected}
                className="mt-1 rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
              />
              <div className="min-w-0 flex-1">
                {proposal.kind === 'missing_variant' ? (
                  <>
                    <p className="text-white text-sm font-medium flex items-center gap-2">
                      <Plus size={14} className="text-emerald-400 shrink-0" />
                      {proposal.trackName} — {proposal.year}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {proposal.projectCount} project(s) target this admission year, but no configuration
                      covers it — students of {proposal.year} can't pick this track today.
                    </p>
                    <p className="mt-1">
                      <MentorList mentors={proposal.mentors} tone="plain" />
                      {proposal.mentors.length === 0 && (
                        <span className="text-xs text-amber-400">
                          No mentors recommended — you'll need to staff it afterwards.
                        </span>
                      )}
                    </p>
                  </>
                ) : proposal.kind === 'roster_differs' ? (
                  <>
                    <p className="text-white text-sm font-medium flex items-center gap-2">
                      <Users size={14} className="text-gold shrink-0" />
                      {proposal.trackName}
                      <span className="text-gray-500 font-normal">
                        {proposal.variantLabel ?? proposal.years.join(', ')}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Mentors differ from what its {proposal.projectCount} project(s) recommend.
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <MentorList mentors={proposal.mentorsToAdd} tone="add" />
                      <MentorList mentors={proposal.mentorsToRemove} tone="remove" />
                    </p>
                    {/* Removal is the destructive half and the easiest to miss
                        in a list of additions, so it gets said in words too. */}
                    {proposal.mentorsToRemove.length > 0 && (
                      <p className="text-xs text-red-400/80 mt-1 flex items-start gap-1.5">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        Applying this removes {proposal.mentorsToRemove.length} mentor(s) the catalog
                        doesn't recommend — including anyone assigned by hand.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {informational.length > 0 && (
        <div className="border-t border-zinc-800 pt-3 space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-gray-500">Nothing to do</p>
          {informational.map((proposal) => (
            <p key={keyOf(proposal)} className="text-sm text-gray-400 flex items-center gap-2">
              {proposal.kind === 'in_sync' ? (
                <>
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-gray-300">{proposal.trackName}</span>
                  <span className="text-gray-500">
                    {proposal.variantLabel ?? proposal.years.join(', ')} · {proposal.projectCount} project(s) ·
                    mentors match
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                  <span className="text-gray-300">{proposal.trackName}</span>
                  <span className="text-gray-500">
                    {proposal.variantLabel ??
                      (proposal.eligibilityType === 'unique'
                        ? 'specific students'
                        : proposal.eligibilityValue)}{' '}
                    · no catalog projects. Left alone — upload its projects, or remove it yourself if it
                    isn't running.
                  </span>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      <div className="pt-2">
        <button
          onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/track-config`)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Back to Track Configuration
        </button>
      </div>
    </div>
  );
}
