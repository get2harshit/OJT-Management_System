// Read and edit one team-proposed project.
//
// Opens read-only by default: this is a student's own writing, and the common
// case is looking at it rather than changing it. Editing is a deliberate
// switch, and only the fields the backend will accept become inputs — the
// rest (track, catalog id, theme...) stay visible but flat, so it's obvious
// they exist and equally obvious they're not yours to change.
import { useState, useEffect, useCallback } from 'react';
import { Pencil, X, History, Loader2, Users } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useToast } from '../../../toast';
import {
  apiGetSelfProposedProject,
  apiUpdateSelfProposedProject,
  apiGetSelfProposedHistory,
  type SelfProposedProject,
  type SelfProposedEditableFields,
  type SelfProposedEdit,
} from '../../../lib/api/selfProposedProjects';

interface Props {
  projectId: string;
  initialMode: 'view' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}

type FieldKind = 'text' | 'textarea' | 'list' | 'number';

interface FieldSpec {
  key: keyof SelfProposedEditableFields;
  label: string;
  kind: FieldKind;
  /** Shown under list inputs, which take comma-separated text. */
  hint?: string;
}

// Grouped the way the student filled the form in, so a mentor reading the two
// side by side sees the same order.
const FIELD_GROUPS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: 'Overview',
    fields: [
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'industry', label: 'Industry', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
      { key: 'problemStatement', label: 'Problem statement', kind: 'textarea' },
      { key: 'projectDescription', label: 'Short description', kind: 'textarea' },
      { key: 'endUsersDefined', label: 'End users', kind: 'text' },
    ],
  },
  {
    title: 'Scope',
    fields: [
      { key: 'techStack', label: 'Tech stack', kind: 'list' },
      { key: 'framework', label: 'Framework', kind: 'list' },
      { key: 'suggestedLibrariesTools', label: 'Suggested libraries / tools', kind: 'list' },
      { key: 'courseCovered', label: 'Courses covered', kind: 'list' },
      { key: 'coreLearningGoals', label: 'Core learning goals', kind: 'list' },
      { key: 'estimatedDuration', label: 'Estimated duration (weeks)', kind: 'number' },
    ],
  },
  {
    title: 'Features & evaluation',
    fields: [
      { key: 'mustHaveFeatures', label: 'Must-have features', kind: 'list' },
      { key: 'goodToHaveFeatures', label: 'Good-to-have features', kind: 'list' },
      { key: 'expectedOutput', label: 'Expected output', kind: 'list' },
      { key: 'evaluationMetrics', label: 'Evaluation metrics', kind: 'list' },
      { key: 'stretchGoal', label: 'Stretch goal', kind: 'list' },
    ],
  },
  {
    title: 'Milestones',
    fields: [
      { key: 'firstMonthMilestones', label: '1st month', kind: 'list' },
      { key: 'secondMonthMilestones', label: '2nd month', kind: 'list' },
      { key: 'thirdMonthMilestones', label: '3rd month', kind: 'list' },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);

// Form state is all strings: a list is edited as comma-separated text and a
// number as its typed characters, so an in-progress "1" doesn't have to be a
// valid value yet. Conversion happens once, on save.
type FormState = Record<string, string>;

const inputClass =
  'w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 transition-colors';

export default function SelfProposedProjectModal({ projectId, initialMode, onClose, onSaved }: Props) {
  const { showSuccess, showError } = useToast();
  const [project, setProject] = useState<SelfProposedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<SelfProposedEdit[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await apiGetSelfProposedProject(projectId);
      setProject(p);
      setForm(toFormState(p));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load project');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [projectId, showError, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = async () => {
    setHistoryOpen(true);
    if (history) return;
    try {
      setHistory(await apiGetSelfProposedHistory(projectId));
    } catch {
      setHistory([]);
    }
  };

  const setField = (key: string) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!project) return;
    // Only what actually differs goes over the wire. Sending the whole object
    // would mean re-writing every field on every save, filling the history
    // with rows that record no change.
    const patch = buildPatch(project, form);
    if (Object.keys(patch).length === 0) {
      showError('Nothing changed');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiUpdateSelfProposedProject(project.id, patch);
      setProject(updated);
      setForm(toFormState(updated));
      setHistory(null);
      setMode('view');
      showSuccess('Project updated');
      onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="xl" title={project ? project.title : 'Project'}>
      {loading || !project ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : (
        <div className="space-y-5">
          <ContextHeader project={project} />

          {/* Sticky: this form runs to twenty fields, and Save scrolling away
              behind the milestones meant scrolling back to the top to commit
              an edit made at the bottom. */}
          <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-zinc-900 flex items-center justify-between gap-3 border-b border-zinc-800">
            <button
              onClick={openHistory}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <History size={14} />
              Edit history
              {project.lastEdit && (
                <span className="text-gray-600">
                  · last {new Date(project.lastEdit.at).toLocaleDateString()} by {project.lastEdit.by}
                </span>
              )}
            </button>
            {mode === 'view' ? (
              <Button onClick={() => setMode('edit')}>
                <Pencil size={14} className="mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setForm(toFormState(project));
                    setMode('view');
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  <X size={14} />
                  Cancel
                </button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            )}
          </div>

          {historyOpen && <HistoryPanel history={history} onClose={() => setHistoryOpen(false)} />}

          {mode === 'edit' && (
            <p className="text-[11px] text-gray-500">
              Multi-value fields (tech stack, features, milestones…) take a comma-separated list.
            </p>
          )}

          {FIELD_GROUPS.map((group) => (
            <section key={group.title} className="space-y-3">
              <p className="text-xs text-gold uppercase font-bold tracking-wider">{group.title}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.fields.map((spec) => (
                  <FieldRow
                    key={spec.key}
                    spec={spec}
                    project={project}
                    value={form[spec.key] ?? ''}
                    onChange={setField(spec.key)}
                    editing={mode === 'edit'}
                  />
                ))}
              </div>
            </section>
          ))}

          <ReadOnlyFooter project={project} />
        </div>
      )}
    </Modal>
  );
}

/** Team, students and track — the things this modal can never change. */
function ContextHeader({ project }: { project: SelfProposedProject }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
      <span className="text-sm">
        <span className="text-gray-500">Team </span>
        <span className="text-white font-semibold">{project.team.name ?? '—'}</span>
      </span>
      <span className="flex items-center gap-1.5 text-sm text-gray-300">
        <Users size={13} className="text-gray-500" />
        {project.team.members.map((m) => m.fullName ?? '—').join(', ') || '—'}
      </span>
      <span className="text-sm">
        <span className="text-gray-500">Track </span>
        <span className="text-white">{project.trackName}</span>
      </span>
      {project.projectId && (
        <span className="font-mono text-xs text-gray-500">{project.projectId}</span>
      )}
    </div>
  );
}

function FieldRow({
  spec,
  project,
  value,
  onChange,
  editing,
}: {
  spec: FieldSpec;
  project: SelfProposedProject;
  value: string;
  onChange: (value: string) => void;
  editing: boolean;
}) {
  const wide = spec.kind === 'textarea';
  return (
    <div className={wide ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
      <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
        {spec.label}
      </label>
      {editing ? (
        <>
          {spec.kind === 'textarea' ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          ) : (
            <input
              type={spec.kind === 'number' ? 'number' : 'text'}
              min={spec.kind === 'number' ? 1 : undefined}
              max={spec.kind === 'number' ? 52 : undefined}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
            />
          )}
        </>
      ) : (
        <ReadOnlyValue value={displayValue(project, spec)} />
      )}
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string }) {
  if (!value) return <p className="text-sm text-gray-600">—</p>;
  return <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{value}</p>;
}

/**
 * Fields the student filled in that staff may not change.
 *
 * Shown rather than hidden so nobody goes looking for a missing field, and
 * labelled as frozen so nobody files it as a bug that they can't be edited.
 */
function ReadOnlyFooter({ project }: { project: SelfProposedProject }) {
  const rows = [
    { label: 'Theme', value: project.theme },
    { label: 'Reference docs', value: project.referenceDocs },
    { label: 'Source / Startup School', value: project.sourceStartupSchool },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;
  return (
    <section className="space-y-2 border-t border-zinc-800 pt-4">
      <p className="text-[11px] uppercase tracking-wider text-gray-600 font-bold">
        Not editable
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold">{r.label}</p>
            <p className="text-sm text-gray-400 break-words">{r.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryPanel({ history, onClose }: { history: SelfProposedEdit[] | null; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Edit history</p>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      {history === null ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-gray-500">No edits yet — this is exactly as the team submitted it.</p>
      ) : (
        <ul className="space-y-2.5 max-h-64 overflow-y-auto">
          {history.map((h) => (
            <li key={h.id} className="text-xs space-y-1">
              <p className="text-gray-400">
                <span className="text-white font-semibold">{labelFor(h.field)}</span>
                {' · '}
                {h.changedBy.name}
                {' · '}
                {new Date(h.changedAt).toLocaleString()}
              </p>
              <p className="text-gray-500 line-through break-words">{formatValue(h.oldValue) || '(empty)'}</p>
              <p className="text-gray-300 break-words">{formatValue(h.newValue) || '(empty)'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── value plumbing ───────────────────────────────────────────────────────────

function labelFor(field: string): string {
  return ALL_FIELDS.find((f) => f.key === field)?.label ?? field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function displayValue(project: SelfProposedProject, spec: FieldSpec): string {
  return formatValue(project[spec.key]);
}

function toFormState(project: SelfProposedProject): FormState {
  const state: FormState = {};
  for (const spec of ALL_FIELDS) state[spec.key] = formatValue(project[spec.key]);
  return state;
}

/**
 * Turns the string form back into typed values, keeping only what differs
 * from what the server currently holds.
 *
 * Comparison happens on the *formatted* value rather than the parsed one, so
 * whitespace a user added around a comma doesn't register as an edit.
 */
function buildPatch(
  project: SelfProposedProject,
  form: FormState
): Partial<SelfProposedEditableFields> {
  const patch: Record<string, unknown> = {};
  for (const spec of ALL_FIELDS) {
    const next = (form[spec.key] ?? '').trim();
    const current = formatValue(project[spec.key]).trim();
    if (next === current) continue;

    if (spec.kind === 'list') {
      patch[spec.key] = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (spec.kind === 'number') {
      // An emptied number field means "unset", not zero.
      patch[spec.key] = next === '' ? null : Number(next);
    } else {
      patch[spec.key] = next === '' ? null : next;
    }
  }
  return patch as Partial<SelfProposedEditableFields>;
}
