import type { Project, ProjectPartner, RecommendedMentor } from '../lib/types';
import { getTrackColor } from '../lib/constants';
import { useTracks } from '../hooks/useTracks';

/**
 * One catalog project, every field it stores.
 *
 * Deliberately exhaustive rather than a curated subset: an admin opens this to
 * sanity-check exactly what a CSV row actually saved, and a field quietly left
 * out of the view is a field they would swear was never imported.
 *
 * Shared rather than page-local because two screens need the same answer — the
 * catalog table, and the manual-allocation project picker, where an admin has
 * to read a project properly before assigning a team to it. It renders inside
 * whatever the caller opens it in (a modal on one, a full-screen layer over a
 * drawer on the other), so it brings no chrome of its own.
 */
export default function ProjectDetail({ project }: { project: Project }) {
  const { tracks } = useTracks();
  const trackName = tracks.find(t => t.slug === project.track)?.name ?? project.track;
  const style = getTrackColor(project.track);
  const techStack = project.techStack?.length ? project.techStack : (project.related_field ? project.related_field.split(',').map(s => s.trim()).filter(Boolean) : []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {trackName}
        </span>
        {project.projectId && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gold/10 text-gold font-mono">{project.projectId}</span>
        )}
        {project.level && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300 capitalize">{project.level}</span>
        )}
        {project.projectBy && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-750 text-gray-300">{project.projectBy === 'PST' ? 'Admin Catalog' : 'Student Proposed'}</span>
        )}
      </div>

      <ProjectDetailSection label="Description">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.description || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Problem Statement">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.problemStatement || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Project Description (short)">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.projectDescription || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="End Users Defined">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.endUsersDefined || '-'}</p>
      </ProjectDetailSection>

      <ProjectDetailSection label="Reference Docs">
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.referenceDocs || '-'}</p>
      </ProjectDetailSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Recommended Mentors">
          <TagList items={project.recommendedMentors?.map(formatRecommendedMentor)} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Credit Mapping">
          <TagList items={project.creditMapping} />
        </ProjectDetailSection>
      </div>

      <ProjectDetailSection label="Partners">
        <PartnerList partners={project.partners} />
      </ProjectDetailSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Tech Stack">
          <TagList items={techStack} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Framework">
          <TagList items={project.framework} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Suggested Libraries / Tools">
          <TagList items={project.suggestedLibrariesTools} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Course Covered">
          <TagList items={project.courseCovered} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Industry">
          <p className="text-sm text-gray-300">{project.industry || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Theme">
          <p className="text-sm text-gray-300">{project.theme || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Source / Startup School">
          <p className="text-sm text-gray-300">{project.sourceStartupSchool || '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Estimated Duration">
          <p className="text-sm text-gray-300">{project.estimatedDuration ? `${project.estimatedDuration} week${project.estimatedDuration === 1 ? '' : 's'}` : '-'}</p>
        </ProjectDetailSection>
        <ProjectDetailSection label="Batch">
          <TagList items={project.batch} />
        </ProjectDetailSection>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProjectDetailSection label="Must Have Features">
          <TagList items={project.mustHaveFeatures} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Good To Have Features">
          <TagList items={project.goodToHaveFeatures} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Core Learning Goals">
          <TagList items={project.coreLearningGoals} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Stretch Goal">
          <TagList items={project.stretchGoal} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Evaluation Metrics">
          <TagList items={project.evaluationMetrics} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Expected Output">
          <TagList items={project.expectedOutput} />
        </ProjectDetailSection>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ProjectDetailSection label="First Month Milestones">
          <TagList items={project.firstMonthMilestones} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Second Month Milestones">
          <TagList items={project.secondMonthMilestones} />
        </ProjectDetailSection>
        <ProjectDetailSection label="Third Month Milestones">
          <TagList items={project.thirdMonthMilestones} />
        </ProjectDetailSection>
      </div>

      {project.created_at && (
        <p className="text-[11px] text-gray-500 pt-2 border-t border-zinc-800">
          Created {new Date(project.created_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ProjectDetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// A recommended mentor is a real mentor row, so fullName is only ever null if
// that mentor has since been removed — show the gap rather than hiding the entry.
function formatRecommendedMentor(mentor: RecommendedMentor): string {
  const name = mentor.fullName ?? 'Unknown mentor';
  return mentor.organization ? `${name} · ${mentor.organization}` : name;
}

function PartnerList({ partners }: { partners?: ProjectPartner[] }) {
  if (!partners || partners.length === 0) return <p className="text-sm text-gray-500">-</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {partners.map(partner => (
        <span key={partner.name} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-zinc-750 text-gray-300">
          {partner.logoUrl && (
            <img src={partner.logoUrl} alt="" loading="lazy" className="w-4 h-4 object-contain rounded-sm" />
          )}
          {partner.name}
        </span>
      ))}
    </div>
  );
}

function TagList({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <p className="text-sm text-gray-500">-</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs px-2 py-1 rounded-full bg-zinc-750 text-gray-300">
          {item}
        </span>
      ))}
    </div>
  );
}
