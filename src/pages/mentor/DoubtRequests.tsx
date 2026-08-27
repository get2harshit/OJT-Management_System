import { useState, useEffect, useCallback } from 'react';
import { HelpCircle, CalendarCheck, Check, X, Clock, Users } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import {
  apiGetDoubtRequestInbox,
  apiAcceptDoubtRequest,
  apiDeclineDoubtRequest,
  type ApiDoubtRequest,
  type ApiDoubtRequestStatus,
} from '../../lib/api';
import { DEFAULT_SESSION_LOCATION, PST_CAMPUS_ROOM_OPTIONS } from '../../lib/sessionLocation';
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
  { value: 'pending', label: 'Needs a reply' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Withdrawn' },
];

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The next weekday at 10:00 — never in the past, and not a Saturday or Sunday.
 *
 * Only a starting point, not a rule: the backend checks the mentor's real
 * configured working days and rejects a bad slot either way. Skipping the
 * weekend here just stops the common case — accepting something on a Friday —
 * from opening on a day that will obviously be refused.
 */
function defaultSlot(): { startLocal: string; endLocal: string } {
  const start = new Date();
  do {
    start.setDate(start.getDate() + 1);
  } while (start.getDay() === 0 || start.getDay() === 6);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  return { startLocal: toLocalInputValue(start), endLocal: toLocalInputValue(end) };
}

interface AcceptForm {
  request: ApiDoubtRequest;
  startLocal: string;
  endLocal: string;
  locationOrLink: string;
  decisionNote: string;
}

/**
 * Doubt requests students have sent this mentor.
 *
 * Separate from Session Requests, which is this mentor asking an admin to
 * approve a combined/on-demand session — different direction, different
 * approver. Accepting here schedules a real session immediately, so the slot
 * picker lives in this screen rather than sending the mentor to the calendar.
 */
export default function MentorDoubtRequests() {
  const { showSuccess, showError } = useToast();

  const [requests, setRequests] = useState<ApiDoubtRequest[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);
  const [acceptForm, setAcceptForm] = useState<AcceptForm | null>(null);
  const [declining, setDeclining] = useState<{ request: ApiDoubtRequest; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetDoubtRequestInbox({ status: (status as ApiDoubtRequestStatus) || undefined, limit: 50 });
      setRequests(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load doubt requests');
    } finally {
      setLoading(false);
    }
  }, [status, showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  /**
   * A decided row must leave a filtered view it no longer belongs to,
   * otherwise it stays clickable and the next click hits the backend's
   * "already decided" 409 instead of simply not being offered.
   */
  const reconcileAfterDecision = (decided: ApiDoubtRequest) => {
    setRequests((prev) =>
      status && decided.status !== status
        ? prev.filter((r) => r.id !== decided.id)
        : prev.map((r) => (r.id === decided.id ? decided : r))
    );
  };

  const accept = async () => {
    if (!acceptForm) return;
    const start = new Date(acceptForm.startLocal);
    const end = new Date(acceptForm.endLocal);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      showError('Pick a start time before the end time');
      return;
    }
    setSaving(true);
    try {
      const decided = await apiAcceptDoubtRequest(acceptForm.request.id, {
        scheduledDate: start.toISOString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        locationOrLink: acceptForm.locationOrLink.trim() || undefined,
        decisionNote: acceptForm.decisionNote.trim() || undefined,
      });
      showSuccess('Session scheduled and the student notified');
      reconcileAfterDecision(decided);
      setAcceptForm(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not schedule that session');
    } finally {
      setSaving(false);
    }
  };

  const decline = async () => {
    if (!declining || !declining.note.trim()) return;
    setSaving(true);
    try {
      const decided = await apiDeclineDoubtRequest(declining.request.id, declining.note.trim());
      showSuccess('Reply sent');
      reconcileAfterDecision(decided);
      setDeclining(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not decline that request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HelpCircle size={24} className="text-gold" />
            Doubt Requests
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Students asking for time on something they&apos;re stuck on. Accepting one schedules the session.
          </p>
        </div>
        <Select
          value={status}
          onChange={setStatus}
          variant="filter"
          placeholder="All requests"
          className="w-[190px]"
          options={STATUS_OPTIONS}
        />
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-10 text-center">
          <HelpCircle size={30} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {status === 'pending' ? 'Nothing waiting on you right now.' : 'Nothing here with that status.'}
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
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${STATUS_STYLES[request.status]}`}
                    >
                      {request.status === 'cancelled' ? 'withdrawn' : request.status}
                    </span>
                    {request.team && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-gray-400 border border-zinc-700">
                        <Users size={10} />
                        {request.team.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {request.raisedBy.full_name} · {formatInIST(request.created_at, { day: '2-digit', month: 'short' })}
                  </p>
                  {request.description && <p className="text-sm text-gray-300 mt-2">{request.description}</p>}
                  {request.preferred_window && (
                    <p className="inline-flex items-center gap-1.5 text-xs text-gray-400 mt-2">
                      <Clock size={12} className="shrink-0" />
                      Suits them: {request.preferred_window}
                    </p>
                  )}
                </div>

                {request.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setDeclining({ request, note: '' })}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                      <X size={13} />
                      Decline
                    </button>
                    <button
                      onClick={() =>
                        setAcceptForm({
                          request,
                          ...defaultSlot(),
                          locationOrLink: DEFAULT_SESSION_LOCATION,
                          decisionNote: '',
                        })
                      }
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
                    >
                      <Check size={13} />
                      Accept &amp; schedule
                    </button>
                  </div>
                )}
              </div>

              {request.status === 'accepted' && request.resultingSession && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-400 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
                  <CalendarCheck size={15} className="shrink-0" />
                  <span>
                    {formatInIST(request.resultingSession.start_time, {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                    {request.resultingSession.location_or_link ? ` · ${request.resultingSession.location_or_link}` : ''}
                  </span>
                </div>
              )}

              {request.status === 'declined' && request.decision_note && (
                <p className="mt-3 text-sm text-gray-300 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                  <span className="text-gray-500">You replied: </span>
                  {request.decision_note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Accept — the mentor picks the slot here, which is why this screen and
          not the calendar owns the decision. */}
      <Modal open={!!acceptForm} onClose={() => setAcceptForm(null)} title="Schedule this session" size="lg">
        {acceptForm && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5">
              <p className="text-sm text-white font-medium">{acceptForm.request.topic}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {acceptForm.request.raisedBy.full_name}
                {acceptForm.request.preferred_window ? ` · suits them: ${acceptForm.request.preferred_window}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Starts</label>
                <input
                  type="datetime-local"
                  value={acceptForm.startLocal}
                  onChange={(e) => setAcceptForm({ ...acceptForm, startLocal: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Ends</label>
                <input
                  type="datetime-local"
                  value={acceptForm.endLocal}
                  onChange={(e) => setAcceptForm({ ...acceptForm, endLocal: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Where</label>
              <Select
                value={
                  PST_CAMPUS_ROOM_OPTIONS.some((o) => o.value === acceptForm.locationOrLink)
                    ? acceptForm.locationOrLink
                    : ''
                }
                onChange={(v) => setAcceptForm({ ...acceptForm, locationOrLink: v as string })}
                options={PST_CAMPUS_ROOM_OPTIONS}
                placeholder="Pick a PST Campus room…"
                isSearchable
                className="w-full mb-2"
              />
              <input
                value={acceptForm.locationOrLink}
                onChange={(e) => setAcceptForm({ ...acceptForm, locationOrLink: e.target.value })}
                placeholder="…or paste a meeting link"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Anything to tell them (optional)</label>
              <input
                value={acceptForm.decisionNote}
                onChange={(e) => setAcceptForm({ ...acceptForm, decisionNote: e.target.value })}
                placeholder="e.g. bring your current branch"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAcceptForm(null)}
                className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={accept}
                disabled={saving}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40"
              >
                {saving ? 'Scheduling…' : 'Schedule session'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Decline — a reason is required, so the student never sees a bare "no". */}
      <Modal open={!!declining} onClose={() => setDeclining(null)} title="Decline this request" size="lg">
        {declining && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">{declining.request.topic}</p>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Why? <span className="text-gold">*</span>
              </label>
              <textarea
                value={declining.note}
                onChange={(e) => setDeclining({ ...declining, note: e.target.value })}
                rows={3}
                placeholder="e.g. we covered this on Tuesday — check the recording first, then come back if it's still unclear"
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/60 resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1">The student sees this, so make it useful.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeclining(null)}
                className="text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={decline}
                disabled={saving || !declining.note.trim()}
                className="text-xs px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/30 font-semibold rounded-lg hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
