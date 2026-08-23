import { useState, useEffect } from 'react';
import { Users, FolderGit2, Loader2 } from 'lucide-react';
import type { Project } from '../lib/types';
import { apiGetProject } from '../lib/api';
import type { ApiMentorRosterTeam } from '../lib/api/teamRoster';

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
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

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
          />
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, fallbackTitle, fallbackTrack }: { project: Project | null; fallbackTitle: string; fallbackTrack: string }) {
  const title = project?.title ?? fallbackTitle;
  const track = project?.track ?? fallbackTrack;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {project?.projectId && <span className="text-[11px] font-mono text-gray-500">{project.projectId}</span>}
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold">
            <FolderGit2 size={12} />
            {track}
          </span>
        </div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
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
