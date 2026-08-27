import { useState, useEffect, useCallback } from 'react';
import { HelpCircle, Plus, CalendarCheck, X } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import {
  apiRaiseDoubtRequest,
  apiGetMyDoubtRequests,
  apiCancelDoubtRequest,
  type ApiDoubtRequest,
  type ApiDoubtRequestStatus,
} from '../../lib/api';
import { formatInIST } from '../../lib/utils';
import { usePageRefresh } from '../../context/RefreshContext';
import { useToast } from '../../toast';

const STATUS_STYLES: Record<ApiDoubtRequestStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  declined: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-zinc-750 text-gray-400 border-zinc-700',
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Waiting on mentor' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Withdrawn' },
];

interface FormState {
  topic: string;
  description: string;
  forTeam: boolean;
  preferredWindow: string;
}

const EMPTY_FORM: FormState = { topic: '', description: '', forTeam: false, preferredWindow: '' };

/**
 * A student asking their own mentor for time on something they're stuck on.
 *
 * No time picker here on purpose: the student says what they need and when
 * roughly suits them, and the mentor picks the actual slot when they accept —
 * the calendar, and all its working-hours and clash rules, is the mentor's.
 */
export default function StudentDoubtRequests() {
  const { showSuccess, showError } = useToast();

  const [requests, setRequests] = useState<ApiDoubtRequest[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMyDoubtRequests({ status: (status as ApiDoubtRequestStatus) || undefined, limit: 50 });
      setRequests(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your requests');
    } finally {
      setLoading(false);
    }
  }, [status, showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  const submit = async () => {
    if (!form || !form.topic.trim()) return;
    setSaving(true);
    try {
      await apiRaiseDoubtRequest({
        topic: form.topic.trim(),
        description: form.description.trim() || undefined,
        forTeam: form.forTeam || undefined,
        preferredWindow: form.preferredWindow.trim() || undefined,
      });
      showSuccess('Sent to your mentor');
      setForm(null);
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not send your request');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (request: ApiDoubtRequest) => {
    try {
      await apiCancelDoubtRequest(request.id);
      showSuccess('Request withdrawn');
      load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not withdraw that request');
    }
  };

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HelpCircle size={24} className="text-gold" />
            Ask for a Session
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Stuck on something? Send it to your mentor and they&apos;ll schedule time for it.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select
            value={status}
            onChange={setStatus}
            variant="filter"
            placeholder="All requests"
            className="w-[190px]"
            options={STATUS_OPTIONS}
          />
          <button
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            <Plus size={14} />
            New Request
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <HelpCircle size={30} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {status ? 'Nothing here with that status.' : "You haven't asked for a session yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold text-sm">{request.topic}</p>
                    <StatusPill status={request.status} />
                    {request.team && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-gray-400 border border-zinc-700">
                        for {request.team.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Sent to {request.mentor.full_name} · {formatInIST(request.created_at, { day: '2-digit', month: 'short' })}
                  </p>
                  {request.description && <p className="text-sm text-gray-300 mt-2">{request.description}</p>}
                </div>

                {request.status === 'pending' && (
                  <button
                    onClick={() => withdraw(request)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                  >
                    <X size={13} />
                    Withdraw
                  </button>
                )}
              </div>

              {request.status === 'accepted' && request.resultingSession && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-400 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
                  <CalendarCheck size={15} className="shrink-0" />
                  <span>
                    Scheduled for{' '}
                    {formatInIST(request.resultingSession.start_time, {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                    {request.resultingSession.location_or_link ? ` · ${request.resultingSession.location_or_link}` : ''}
                  </span>
                </div>
              )}

              {request.status === 'declined' && request.decision_note && (
                <p className="mt-3 text-sm text-gray-300 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                  <span className="text-gray-500">Mentor replied: </span>
                  {request.decision_note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Ask your mentor for a session" size="lg">
        {form && (
          <div className="space-y-4">
            <Field label="What do you need help with?" required>
              <input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                maxLength={200}
                placeholder="e.g. Stuck on the recursion in the parser"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
            </Field>

            <Field label="Any detail that would help them prepare">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="What you've already tried, where exactly it breaks…"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-none"
              />
            </Field>

            <Field label="When roughly suits you?">
              <input
                value={form.preferredWindow}
                onChange={(e) => setForm({ ...form, preferredWindow: e.target.value })}
                maxLength={200}
                placeholder="e.g. mornings, or after 4pm on weekdays"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Your mentor picks the actual slot — this just tells them what works for you.
              </p>
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.forTeam}
                onChange={(e) => setForm({ ...form, forTeam: e.target.checked })}
                className="accent-gold w-4 h-4"
              />
              This is for my whole team, not just me
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setForm(null)}
                className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || !form.topic.trim()}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Sending…' : 'Send to mentor'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}

function StatusPill({ status }: { status: ApiDoubtRequestStatus }) {
  const label = status === 'pending' ? 'waiting' : status === 'cancelled' ? 'withdrawn' : status;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${STATUS_STYLES[status]}`}>
      {label}
    </span>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">
        {label}
        {required && <span className="text-gold ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
