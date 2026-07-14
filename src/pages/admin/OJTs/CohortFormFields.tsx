import DateRangePicker from '../../../components/DateRangePicker';
import Select from '../../../components/Select';
import { SEMESTER_SESSION_OPTIONS, SEMESTER_SESSION_LABELS } from '../../../lib/constants';
import { computeCohortDefaultsFromStartDate, type CohortFormState } from '../../../lib/cohortForm';

interface CohortFormFieldsProps {
  form: CohortFormState;
  onChange: (form: CohortFormState) => void;
  eligibleBatchOptions: string[];
}

// Field markup for the cohort form, shared by the Create and Edit flows of
// the cohort modal in CohortsPanel. `eligibleBatchOptions` is the real list
// of batch codes currently in use by students (see apiListStudentBatches) —
// batches have no fixed relationship to the cohort's start date, so this
// list is fetched once by the parent rather than derived here.
export default function CohortFormFields({ form, onChange, eligibleBatchOptions }: CohortFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">OJT Duration (Start → End Date)</label>
        <DateRangePicker
          startDate={form.startDate}
          endDate={form.endDate}
          onRangeChange={({ startDate, endDate }) => {
            if (startDate && startDate !== form.startDate) {
              const defaults = computeCohortDefaultsFromStartDate(startDate);
              onChange({
                ...form,
                startDate,
                endDate,
                sessionTerm: defaults.sessionTerm,
                name: defaults.name,
              });
            } else if (!startDate) {
              onChange({ ...form, startDate: '', endDate: '' });
            } else {
              onChange({ ...form, endDate });
            }
          }}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Cohort Name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => onChange({ ...form, name: e.target.value })}
          placeholder="e.g. OJT August 2026"
          className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Allowed Batches</label>
        <div className="flex flex-wrap gap-3 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 min-h-[42px] items-center">
          {eligibleBatchOptions.length === 0 ? (
            <span className="text-sm text-gray-500">No student batches found</span>
          ) : (
            eligibleBatchOptions.map(batch => {
              const checked = form.allowedBatches.includes(batch);
              return (
                <label key={batch} className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? form.allowedBatches.filter(b => b !== batch)
                        : [...form.allowedBatches, batch];
                      onChange({ ...form, allowedBatches: next });
                    }}
                    className="accent-gold"
                  />
                  {batch}
                </label>
              );
            })
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Semester <span className="text-gray-600">(auto-set from Start Date)</span></label>
        <Select
          value={form.sessionTerm}
          onChange={() => {}}
          disabled
          className="w-full"
          options={SEMESTER_SESSION_OPTIONS.map(t => ({ value: t, label: SEMESTER_SESSION_LABELS[t] }))}
        />
      </div>
      <div className="flex items-center pb-1">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => onChange({ ...form, isActive: e.target.checked })}
            className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
          />
          Mark as Active Cohort
        </label>
      </div>
    </div>
  );
}
