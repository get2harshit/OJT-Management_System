import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import type { Cohort, ApiMentor } from '../../lib/types';
import {
  apiListCohorts,
  apiListMentorsPage,
  apiGetSchedulingConfig,
  apiUpdateSchedulingConfig,
  apiListHolidays,
  apiAddHoliday,
  apiDeleteHoliday,
  apiGetSelfSchedulePermissionsForCohort,
  apiSetSelfSchedulePermission,
  type ApiHoliday,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function SchedulingConfig() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState(searchParams.get('cohortId') || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dayStart, setDayStart] = useState('09:00');
  const [dayEnd, setDayEnd] = useState('18:00');
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [minGap, setMinGap] = useState(0);

  const [holidays, setHolidays] = useState<ApiHoliday[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayReason, setNewHolidayReason] = useState('');

  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiListCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  const load = useCallback(async () => {
    if (!cohortId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [config, holidaysRes, mentorsRes, permsRes] = await Promise.all([
        apiGetSchedulingConfig(cohortId),
        apiListHolidays(cohortId),
        apiListMentorsPage({ page: 1, limit: 200, cohortId }),
        apiGetSelfSchedulePermissionsForCohort(cohortId),
      ]);
      setWorkingDays(config.working_days);
      setDayStart(minutesToTime(config.day_start_minute));
      setDayEnd(minutesToTime(config.day_end_minute));
      setDefaultDuration(config.default_session_duration_minutes);
      setMinGap(config.min_gap_minutes);
      setHolidays(holidaysRes);
      setMentors(mentorsRes.data);
      setPermissions(permsRes);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load scheduling config');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (day: number) => {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const saveConfig = async () => {
    if (!cohortId) return;
    setSaving(true);
    try {
      await apiUpdateSchedulingConfig(cohortId, {
        workingDays,
        dayStartMinute: timeToMinutes(dayStart),
        dayEndMinute: timeToMinutes(dayEnd),
        defaultSessionDurationMinutes: defaultDuration,
        minGapMinutes: minGap,
      });
      showSuccess('Scheduling config saved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save scheduling config');
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!cohortId || !newHolidayDate) return;
    try {
      const holiday = await apiAddHoliday(cohortId, newHolidayDate, newHolidayReason || undefined);
      setHolidays((prev) => [...prev, holiday].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
      setNewHolidayDate('');
      setNewHolidayReason('');
      showSuccess('Holiday added');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add holiday');
    }
  };

  const removeHoliday = async (id: string) => {
    try {
      await apiDeleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove holiday');
    }
  };

  const togglePermission = async (mentorId: string) => {
    const next = !permissions[mentorId];
    setPermissions((prev) => ({ ...prev, [mentorId]: next }));
    try {
      await apiSetSelfSchedulePermission(cohortId, mentorId, next);
    } catch (err) {
      setPermissions((prev) => ({ ...prev, [mentorId]: !next }));
      showError(err instanceof Error ? err.message : 'Failed to update permission');
    }
  };

  const cohortOptions = useMemo(() => cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) })), [cohorts]);

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/admin/dashboard/sessions')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gold mb-2 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Sessions
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings size={24} className="text-gold" />
            Scheduling Config
          </h1>
        </div>
        <Select value={cohortId} onChange={setCohortId} variant="filter" placeholder="Select cohort" className="w-[200px]" options={cohortOptions} />
      </div>

      {!cohortId ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center text-gray-400">Select a cohort to configure.</div>
      ) : loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Working Hours</p>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Working Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                      workingDays.includes(idx) ? 'bg-gold text-black border-gold' : 'bg-zinc-900 text-gray-400 border-zinc-750 hover:border-gold/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Day Start</label>
                <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Day End</label>
                <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Default Duration (min)</label>
                <input type="number" min={1} value={defaultDuration} onChange={(e) => setDefaultDuration(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Min Gap (min)</label>
                <input type="number" min={0} value={minGap} onChange={(e) => setMinGap(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
            </div>
            <button onClick={saveConfig} disabled={saving} className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Config'}
            </button>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Holidays</p>
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Date</label>
                <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-gray-400 mb-1 block">Reason (optional)</label>
                <input value={newHolidayReason} onChange={(e) => setNewHolidayReason(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
              </div>
              <button onClick={addHoliday} disabled={!newHolidayDate} className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50">
                <Plus size={14} />
                Add
              </button>
            </div>
            <div className="space-y-1.5">
              {holidays.length === 0 ? (
                <p className="text-gray-500 text-sm">No holidays configured for this cohort.</p>
              ) : (
                holidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                    <span className="text-gray-300 text-sm">
                      {h.holiday_date} {h.reason && <span className="text-gray-500">— {h.reason}</span>}
                    </span>
                    <button onClick={() => removeHoliday(h.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
            <p className="text-xs text-gold uppercase font-bold tracking-wider">Self-Schedule Permission</p>
            <p className="text-gray-500 text-xs">Mentors allowed here can schedule their own sessions in this cohort without an admin.</p>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-thin">
              {mentors.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                  <span className="text-gray-300 text-sm">
                    {m.fullName ?? m.email} {m.isExternal && <span className="text-[10px] text-gray-500 ml-1">(External)</span>}
                  </span>
                  <button
                    onClick={() => togglePermission(m.id)}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border transition-colors ${
                      permissions[m.id] ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-zinc-750 text-gray-400 border-zinc-750'
                    }`}
                  >
                    {permissions[m.id] ? 'Allowed' : 'Not Allowed'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
