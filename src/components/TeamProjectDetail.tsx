import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Users, FolderGit2, Loader2, Lightbulb, Pencil, Eye } from 'lucide-react';
import type { Project } from '../lib/types';
import { apiGetProject } from '../lib/api';
import type { ApiMentorRosterTeam } from '../lib/api/teamRoster';
import { apiListSelfProposedProjects, type SelfProposedProject } from '../lib/api/selfProposedProjects';
import SelfProposedProjectModal from '../pages/admin/OJTs/SelfProposedProjectModal';

/**
 * A team's members plus the full detail card of its allocated project —
 * fetched on mount so the mentor sees the complete project (problem
 * statement, tech stack, goals…), not just the title on a team summary.
 *
 * Used two ways: inside a modal for a quick look from the Teams tab, and
 * inline (no modal) on the Projects tab, where every team's project gets its
 * own full-width card rather than a click-to-reveal.
 */
export default function TeamProjectDetail({ team }: { team: ApiMentorRosterTeam }) {
  const { cohortId } = useParams<{ cohortId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const { proposed, reloadProposed } = useProposedProject(team, cohortId);
  const [openMode, setOpenMode] = useState<'view' | 'edit' | null>(null);

  // Most teams are allocated the very project they proposed, so the card
  // below and a separate "proposed" card would be the same project twice.
  // When they match, the edit affordance goes on the card that's already
  // there instead of duplicating it.
  const allocatedIsProposal = !!proposed && proposed.id === team.allocatedProjectId;

  useEffect(() => {
    if (!team.allocatedProjectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGetProject(team.allocatedProjectId)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch(() => { if (!cancelled) setProject(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [team.allocatedProjectId]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Students</p>
        <div className="flex flex-wrap gap-2">
          {team.members.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-gray-200 border border-zinc-700"
            >
              <Users size={12} className="text-gray-500" />
              {m.fullName ?? 'Unnamed student'}
              {m.rollNumber && <span className="text-gray-500">· {m.rollNumber}</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5">
        {!team.allocatedProjectId ? (
          <p className="text-gray-500 text-sm">No project has been allocated to this team yet.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <ProjectCard
            project={project}
            fallbackTitle={team.allocatedProjectTitle ?? 'Project'}
            fallbackTrack={team.track ?? '—'}
            proposalActions={
              allocatedIsProposal ? <ProposalActions onOpen={setOpenMode} lastEdit={proposed!.lastEdit} /> : null
            }
          />
        )}
      </div>

      {/* Only when it isn't already the card above — a team can have an
          approved proposal and be allocated something else entirely, and
          before the cohort is published there is no allocated card at all. */}
      {proposed && !allocatedIsProposal && (
        <div className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] text-gold uppercase tracking-wide font-bold">
                <Lightbulb size={12} />
                Proposed by this team
              </p>
              <p className="text-white font-semibold mt-1.5 break-words">{proposed.title}</p>
              {proposed.projectId && (
                <p className="text-[11px] font-mono text-gray-500 mt-0.5">{proposed.projectId}</p>
              )}
            </div>
            <ProposalActions onOpen={setOpenMode} lastEdit={proposed.lastEdit} />
          </div>
          {proposed.description && (
            <p className="text-sm text-gray-300 leading-relaxed line-clamp-3 whitespace-pre-wrap">
              {proposed.description}
            </p>
          )}
        </div>
      )}

      {openMode && proposed && (
        <SelfProposedProjectModal
          projectId={proposed.id}
          initialMode={openMode}
          onClose={() => setOpenMode(null)}
          onSaved={reloadProposed}
        />
      )}
    </div>
  );
}

/**
 * This team's own approved proposal, if it has one.
 *
 * Not gated on the cohort being published, unlike the allocated project
 * above: that gate hides draft allocation results, and a team's approved
 * proposal is neither a result nor news to the mentor who approved it.
 */
function useProposedProject(team: ApiMentorRosterTeam, cohortId: string | undefined) {
  const [proposed, setProposed] = useState<SelfProposedProject | null>(null);

  const reloadProposed = useCallback(async () => {
    if (!cohortId) {
      setProposed(null);
      return;
    }
    try {
      // Scoped to this one team server-side; the mentor's own scope applies
      // on top, so a team outside it simply comes back empty.
      const res = await apiListSelfProposedProjects({ cohortId, teamId: team.id, limit: 1 });
      setProposed(res.data[0] ?? null);
    } catch {
      setProposed(null);
    }
  }, [cohortId, team.id]);

  useEffect(() => {
    reloadProposed();
  }, [reloadProposed]);

  return { proposed, reloadProposed };
}

/** View/edit buttons, plus who last touched the proposal. */
function ProposalActions({
  onOpen,
  lastEdit,
}: {
  onOpen: (mode: 'view' | 'edit') => void;
  lastEdit: SelfProposedProject['lastEdit'];
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {lastEdit && (
        <span className="text-[11px] text-gray-500 hidden lg:inline whitespace-nowrap">
          Edited {new Date(lastEdit.at).toLocaleDateString()} by {lastEdit.by}
        </span>
      )}
      <button
        onClick={() => onOpen('view')}
        title="View full project"
        className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Eye size={15} />
      </button>
      <button
        onClick={() => onOpen('edit')}
        title="Edit project"
        className="p-1.5 rounded-md text-gray-400 hover:text-gold hover:bg-zinc-800 transition-colors"
      >
        <Pencil size={15} />
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  fallbackTitle,
  fallbackTrack,
  // Present only when this project is the team's own proposal, which is the
  // one case a mentor may edit — a catalog project shown here is read-only.
  proposalActions = null,
}: {
  project: Project | null;
  fallbackTitle: string;
  fallbackTrack: string;
  proposalActions?: React.ReactNode;
}) {
  const title = project?.title ?? fallbackTitle;
  const track = project?.track ?? fallbackTrack;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {project?.projectId && <span className="text-[11px] font-mono text-gray-500">{project.projectId}</span>}
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
              <FolderGit2 size={12} />
              {track}
            </span>
            {proposalActions && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-gray-300 border border-zinc-700">
                <Lightbulb size={11} className="text-gold shrink-0" />
                Proposed by this team
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white break-words">{title}</h3>
        </div>
        {proposalActions}
      </div>

      {project?.description && (
        <Section label="Description">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{project.description}</p>
        </Section>
      )}
      {project?.problemStatement && (
        <Section label="Problem statement">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{project.problemStatement}</p>
        </Section>
      )}
      {project?.techStack && project.techStack.length > 0 && <ChipSection label="Tech stack" items={project.techStack} />}
      {project?.framework && project.framework.length > 0 && <ChipSection label="Frameworks" items={project.framework} />}
      {project?.coreLearningGoals && project.coreLearningGoals.length > 0 && (
        <ListSection label="Core learning goals" items={project.coreLearningGoals} />
      )}
      {project?.stretchGoal && project.stretchGoal.length > 0 && (
        <ListSection label="Stretch goals" items={project.stretchGoal} />
      )}
      {project?.evaluationMetrics && project.evaluationMetrics.length > 0 && (
        <ListSection label="Evaluation metrics" items={project.evaluationMetrics} />
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <Section label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-gray-300 border border-zinc-700">
            {item}
          </span>
        ))}
      </div>
    </Section>
  );
}

function ListSection({ label, items }: { label: string; items: string[] }) {
  return (
    <Section label={label}>
      <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Section>
  );
}
