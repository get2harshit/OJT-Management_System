import { apiFetch } from './client';

/**
 * The fixed set of parameters a mentor rates a student on for placement
 * readiness — mirrors SKILL_ASSESSMENT_PARAMETERS on the backend exactly.
 * Fixed and hardcoded by design for v1: there is no admin config for this,
 * so both sides simply agree on the same list rather than one fetching it
 * from the other.
 */
export interface SkillAssessmentParameter {
  key: string;
  label: string;
  description: string;
}

export const SKILL_ASSESSMENT_PARAMETERS: SkillAssessmentParameter[] = [
  { key: 'techStack', label: 'Tech Stack', description: 'Language, tools & frameworks used on their project.' },
  { key: 'dsa', label: 'DSA', description: 'Data structures & algorithms — the kind an interview screens for.' },
  {
    key: 'conceptualUnderstanding',
    label: 'Conceptual Understanding',
    description: 'Core CS fundamentals underneath the tools — not just which API to call.',
  },
  {
    key: 'problemSolving',
    label: 'Problem Solving',
    description: 'Breaking an unfamiliar problem down and reasoning toward a solution.',
  },
  { key: 'debugging', label: 'Debugging', description: 'Finding and fixing what actually broke, not guessing at fixes.' },
  { key: 'systemDesign', label: 'System Design Basics', description: 'Structuring a system at a level appropriate for their stage.' },
  {
    key: 'codeQuality',
    label: 'Code Quality',
    description: 'Naming, structure, and habits like testing — code someone else could maintain.',
  },
  { key: 'communication', label: 'Communication', description: 'Explaining their own work clearly, in writing and out loud.' },
  {
    key: 'ownership',
    label: 'Ownership & Collaboration',
    description: 'Driving their own work forward and working well with a team, including git workflow.',
  },
];

export const MIN_SKILL_SCORE = 1;
export const MAX_SKILL_SCORE = 5;

export interface ApiSkillAssessment {
  id: string;
  studentId: string;
  mentorId: string;
  mentorName: string | null;
  cohortId: string;
  scores: Record<string, number>;
  note: string | null;
  assessedAt: string;
}

export function averageSkillScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/**
 * A new placement-readiness snapshot for one student. Mentor-only, and only
 * that student's own mentor in this OJT — the backend is the actual
 * authority on both.
 */
export async function apiCreateSkillAssessment(
  studentId: string,
  payload: { cohortId: string; scores: Record<string, number>; note?: string }
): Promise<ApiSkillAssessment> {
  const res = await apiFetch<{ data: ApiSkillAssessment }>(`/api/v1/students/${studentId}/skill-assessments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

/**
 * Every snapshot for one student in one OJT, most recent first. Visible to
 * the student's own mentor or an admin — never the student themselves.
 */
export async function apiListSkillAssessments(studentId: string, cohortId: string): Promise<ApiSkillAssessment[]> {
  const res = await apiFetch<{ data: ApiSkillAssessment[] }>(
    `/api/v1/students/${studentId}/skill-assessments?cohortId=${encodeURIComponent(cohortId)}`
  );
  return res.data;
}
