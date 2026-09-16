import { useCallback, useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { apiListCohorts, apiListMentorsPage } from '../../../lib/api';
import {
  apiListMentorCoGrants,
  apiCreateMentorCoGrants,
  apiRevokeMentorCoGrant,
  type ApiMentorCoGrant,
} from '../../../lib/api/mentorCoGrants';
import { buildCohortOptions } from '../../../lib/cohortLabel';
import type { Cohort } from '../../../lib/types';
import { useToast } from '../../../toast';

interface CoMentorGrantsModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selects the currently-active OJT, same convenience as the mentor directory's own default. */
  defaultCohortId?: string;
}

/**
 * Admin screen for granting a mentor/external mentor FULL read+write parity
 * over one or more primary mentors' rosters, scoped to one OJT — approve
 * tasks, review submissions, mark attendance, host sessions, everything the
 * primary can do. NOT the same thing as Mentor View Grants (view-only) —
 * a co-mentor's teams merge transparently into their own "My OJT", no
 * switcher needed. Batch managers already have full access everywhere and
 * don't need a row here — the backend rejects that combination.
 */
export default function CoMentorGrantsModal({ open, onClose, defaultCohortId }: CoMentorGrantsModalProps) {
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [mentorOptions, setMentorOptions] = useState<{ value: string; label: string }[]>([]);
  const [coMentorId, setCoMentorId] = useState('');
  const [primaryMentorIds, setPrimaryMentorIds] = useState<string[]>([]);
  const [grants, setGrants] = useState<ApiMentorCoGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiListCohorts()
      .then((res) => {
        setCohorts(res);
        if (!cohortId) setCohortId(defaultCohortId || res.find((c) => c.isActive)?.id || res[0]?.id || '');
      })
      .catch(() => setCohorts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!cohortId) return;
    apiListMentorsPage({ page: 1, limit: 500, cohortId })
      .then((res) => setMentorOptions(res.data.map((m) => ({ value: m.id, label: m.fullName || m.email || m.id }))))
      .catch(() => setMentorOptions([]));
  }, [cohortId]);

  const fetchGrants = useCallback(async () => {
    if (!cohortId) return;
    setLoadingGrants(true);
    try {
      setGrants(await apiListMentorCoGrants(cohortId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load co-mentor grants');
    } finally {
      setLoadingGrants(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  const handleClose = () => {
    setCoMentorId('');
    setPrimaryMentorIds([]);
    onClose();
  };

  const handleSave = async () => {
    if (!coMentorId || primaryMentorIds.length === 0) return;
    setSaving(true);
    try {
      await apiCreateMentorCoGrants({ coMentorId, primaryMentorIds, cohortId });
      showSuccess(`Granted full access to ${primaryMentorIds.length} mentor${primaryMentorIds.length === 1 ? '' : 's'}' rosters`);
      setCoMentorId('');
      setPrimaryMentorIds([]);
      await fetchGrants();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create co-mentor grant');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grant: ApiMentorCoGrant) => {
    try {
      await apiRevokeMentorCoGrant(grant.id);
      showSuccess('Co-mentor access revoked');
      await fetchGrants();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to revoke co-mentor grant');
    }
  };

  const primaryOptions = mentorOptions.filter((m) => m.value !== coMentorId);

  return (
    <Modal open={open} onClose={handleClose} title="Co-Mentor Access" size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Give a mentor or external mentor <span className="text-white font-medium">full</span> access to another
          mentor&apos;s roster — approve tasks, review submissions, mark attendance, host sessions — for one OJT.
          Their teams appear merged straight into their own &quot;My OJT&quot;, no switcher needed. For read-only
          visibility instead, use Mentor View Grants. A batch manager already sees and can do everything and
          doesn&apos;t need this.
        </p>

        <div className="w-56">
          <Select
            value={cohortId}
            onChange={(v) => { setCohortId(v as string); setCoMentorId(''); setPrimaryMentorIds([]); }}
            variant="filter"
            placeholder="Select an OJT"
            options={buildCohortOptions(cohorts)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Grant full access to (co-mentor)</label>
            <Select
              value={coMentorId}
              onChange={(v) => setCoMentorId(v as string)}
              isSearchable
              placeholder="Select a mentor"
              options={mentorOptions}
              disabled={!cohortId}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Over these mentors&apos; rosters (primary mentors)</label>
            <Select
              value={primaryMentorIds}
              onChange={(v) => setPrimaryMentorIds(v as string[])}
              isMulti
              isSearchable
              placeholder="Select one or more mentors"
              options={primaryOptions}
              disabled={!coMentorId}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!coMentorId || primaryMentorIds.length === 0 || saving}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Grant Full Access'}
        </button>

        <div className="pt-2 border-t border-zinc-750">
          <h3 className="text-sm font-semibold text-white mb-2">Active co-mentor grants for this OJT</h3>
          {loadingGrants ? (
            <div className="min-h-[15vh] flex items-center justify-center">
              <SpinnerSquare size={28} />
            </div>
          ) : grants.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No co-mentor grants yet for this OJT.</p>
          ) : (
            <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
              {grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center justify-between gap-3 bg-zinc-800/50 border border-zinc-750 rounded-lg px-3 py-2"
                >
                  <p className="text-sm text-gray-300 truncate">
                    <span className="text-white font-medium">{grant.coMentorName || grant.coMentorId}</span>
                    <span className="text-gray-500"> has full access to </span>
                    <span className="text-white font-medium">{grant.primaryMentorName || grant.primaryMentorId}</span>
                    <span className="text-gray-500">&apos;s roster</span>
                  </p>
                  <button
                    onClick={() => handleRevoke(grant)}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition-colors shrink-0"
                    title="Revoke"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
