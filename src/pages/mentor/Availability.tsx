import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import type { Cohort } from '../../lib/types';
import { apiListMyCohorts, apiGetMyAvailability, apiSetMyAvailability } from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface SlotRow {
  start: string; // HH:MM
  end: string;
}

type SlotsByDay = Record<number, SlotRow[]>;

function emptySlotsByDay(): SlotsByDay {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function MentorAvailability() {
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slotsByDay, setSlotsByDay] = useState<SlotsByDay>(emptySlotsByDay());

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (cohorts.length === 0) return;
    setCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const slots = await apiGetMyAvailability(cohortId);
      const grouped = emptySlotsByDay();
      for (const slot of slots) {
        grouped[slot.day_of_week].push({ start: minutesToTime(slot.start_minute), end: minutesToTime(slot.end_minute) });
      }
      setSlotsByDay(grouped);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  const addSlot = (day: number) => {
    setSlotsByDay((prev) => ({ ...prev, [day]: [...prev[day], { start: '09:00', end: '18:00' }] }));
  };

  const updateSlot = (day: number, index: number, field: 'start' | 'end', value: string) => {
    setSlotsByDay((prev) => ({
      ...prev,
      [day]: prev[day].map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
    }));
  };

  const removeSlot = (day: number, index: number) => {
    setSlotsByDay((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== index) }));
  };

  const save = async () => {
    if (!cohortId) return;
    setSaving(true);
    try {
      const slots = Object.entries(slotsByDay).flatMap(([day, rows]) =>
        rows.map((row) => ({ dayOfWeek: Number(day), startMinute: timeToMinutes(row.start), endMinute: timeToMinutes(row.end) }))
      );
      for (const s of slots) {
        if (s.endMinute <= s.startMinute) {
          showError('Each slot\'s end time must be after its start time');
          setSaving(false);
          return;
        }
      }
      await apiSetMyAvailability(cohortId, slots);
      showSuccess('Availability saved');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const cohortOptions = cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }));

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock size={24} className="text-gold" />
            My Availability
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            The time slots you're free to self-schedule in. Leaving a day empty means no slots on that day; leaving every day empty means no restriction at all.
          </p>
        </div>
        <Select value={cohortId} onChange={setCohortId} variant="filter" placeholder="Select cohort" className="w-[200px]" options={cohortOptions} />
      </div>

      {!cohortId ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center text-gray-400">Select a cohort to manage your availability.</div>
      ) : loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <div className="space-y-4">
          {DAY_LABELS.map((label, day) => (
            <div key={day} className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{label}</p>
                <button
                  onClick={() => addSlot(day)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-gold font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  <Plus size={14} />
                  Add Slot
                </button>
              </div>
              {slotsByDay[day].length === 0 ? (
                <p className="text-gray-500 text-xs">No slots on this day.</p>
              ) : (
                <div className="space-y-2">
                  {slotsByDay[day].map((slot, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateSlot(day, index, 'start', e.target.value)}
                        className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                      />
                      <span className="text-gray-500 text-sm">to</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateSlot(day, index, 'end', e.target.value)}
                        className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                      />
                      <button onClick={() => removeSlot(day, index)} className="text-gray-500 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-6 py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Availability'}
          </button>
        </div>
      )}
    </PageLayout>
  );
}
