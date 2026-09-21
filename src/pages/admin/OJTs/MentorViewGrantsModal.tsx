import { useCallback, useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { apiListCohorts, apiListMentorsPage } from '../../../lib/api';
import {
  apiListMentorViewGrants,
  apiCreateMentorViewGrants,
  apiRevokeMentorViewGrant,
  type ApiMentorViewGrant,
} from '../../../lib/api/mentorViewGrants';
import { buildCohortOptions } from '../../../lib/cohortLabel';
import type { Cohort } from '../../../lib/types';
import { useToast } from '../../../toast';

interface MentorViewGrantsModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selects the currently-active OJT, same convenience as the mentor directory's own default. */
  defaultCohortId?: string;
}

/**
 * Admin screen for granting a mentor/external mentor view-only visibility
 * into one or more other mentors' data, scoped to one OJT. Batch managers
 * already have full read access everywhere and don't need a row here — the
 * backend rejects that combination with a clear message.
 */
export default function MentorViewGrantsModal({ open, onClose, defaultCohortId }: MentorViewGrantsModalProps) {
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [mentorOptions, setMentorOptions] = useState<{ value: string; label: string }[]>([]);
  const [granteeId, setGranteeId] = useState('');
  const [targetMentorIds, setTargetMentorIds] = useState<string[]>([]);
  const [grants, setGrants] = useState<ApiMentorViewGrant[]>([]);
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
      setGrants(await apiListMentorViewGrants(cohortId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load grants');
    } finally {
      setLoadingGrants(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  const handleClose = () => {
    setGranteeId('');
    setTargetMentorIds([]);
    onClose();
  };

  const handleSave = async () => {
    if (!granteeId || targetMentorIds.length === 0) return;
    setSaving(true);
    try {
      await apiCreateMentorViewGrants({ granteeId, targetMentorIds, cohortId });
      showSuccess(`Granted visibility into ${targetMentorIds.length} mentor${targetMentorIds.length === 1 ? '' : 's'}`);
      setGranteeId('');
      setTargetMentorIds([]);
      await fetchGrants();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create grant');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grant: ApiMentorViewGrant) => {
    try {
      await apiRevokeMentorViewGrant(grant.id);
      showSuccess('Grant revoked');
      await fetchGrants();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to revoke grant');
    }
  };

  const targetOptions = mentorOptions.filter((m) => m.value !== granteeId);

  return (
    <Modal open={open} onClose={handleClose} title="Mentor View Grants" size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Give a mentor or external mentor read-only visibility into another mentor&apos;s students — roster,
          submissions, skill assessments, tasks and sessions — for one OJT. A batch manager already sees
          everything and doesn&apos;t need this.
        </p>

        <div className="w-56">
          <Select
            value={cohortId}
            onChange={(v) => { setCohortId(v as string); setGranteeId(''); setTargetMentorIds([]); }}
            variant="filter"
            placeholder="Select an OJT"
            options={buildCohortOptions(cohorts)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Grant to (mentor)</label>
            <Select
              value={granteeId}
              onChange={(v) => setGranteeId(v as string)}
              isSearchable
              placeholder="Select a mentor"
              options={mentorOptions}
              disabled={!cohortId}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Visibility into (target mentors)</label>
            <Select
              value={targetMentorIds}
              onChange={(v) => setTargetMentorIds(v as string[])}
              isMulti
              isSearchable
              placeholder="Select one or more mentors"
              options={targetOptions}
              disabled={!granteeId}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!granteeId || targetMentorIds.length === 0 || saving}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Grant Access'}
        </button>

        <div className="pt-2 border-t border-zinc-750">
          <h3 className="text-sm font-semibold text-white mb-2">Active grants for this OJT</h3>
          {loadingGrants ? (
            <div className="min-h-[15vh] flex items-center justify-center">
              <SpinnerSquare size={28} />
            </div>
          ) : grants.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No grants yet for this OJT.</p>
          ) : (
            <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
              {grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center justify-between gap-3 bg-zinc-800/50 border border-zinc-750 rounded-lg px-3 py-2"
                >
                  <p className="text-sm text-gray-300 truncate">
                    <span className="text-white font-medium">{grant.granteeName || grant.granteeId}</span>
                    <span className="text-gray-500"> can view </span>
                    <span className="text-white font-medium">{grant.targetMentorName || grant.targetMentorId}</span>
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
