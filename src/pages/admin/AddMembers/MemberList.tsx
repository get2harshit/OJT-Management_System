import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import ActionsMenu from '../../../components/ActionsMenu';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { apiListStaff, apiRemoveStaff, apiUpdateStaff, type StaffMember, type StaffRole } from '../../../lib/api';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { useAuth } from '../../../context/useAuth';

const SEARCH_DEBOUNCE_MS = 400;

const INPUT_CLASS =
  'w-full bg-zinc-750 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold focus-visible:ring-1 focus-visible:ring-gold/60';

const COPY: Record<StaffRole, { title: string; noun: string; alsoLabel: string; removeNote: string }> = {
  admin: {
    title: 'Admins',
    noun: 'admin',
    alsoLabel: 'Also mentor',
    removeNote: 'They lose admin access. Any mentor role they hold stays.',
  },
  mentor: {
    title: 'Mentors',
    noun: 'mentor',
    alsoLabel: 'Also admin',
    removeNote: 'They stop being a mentor. Any admin role they hold stays.',
  },
};

function EditMemberModal({ role, member, onClose, onSaved }: {
  role: StaffRole;
  member: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [fullName, setFullName] = useState(member.fullName);
  const [phoneNumber, setPhoneNumber] = useState(member.phoneNumber ?? '');
  const [isExternal, setIsExternal] = useState(!!member.isExternal);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await apiUpdateStaff(role, member.id, {
        fullName,
        phoneNumber: phoneNumber.trim() || null,
        ...(role === 'mentor' ? { isExternal } : {}),
      });
      showSuccess(`${fullName.trim()} updated`);
      onSaved();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${COPY[role].noun}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="edit-member-email" className="text-sm text-gray-300">Email they sign in with</label>
          <input id="edit-member-email" value={member.email} disabled className={`${INPUT_CLASS} opacity-60 cursor-not-allowed`} />
          {/* Their Google sign-in. Changing it is a different person, and the
              old address would keep working — so it is removed and re-added. */}
          <p className="text-xs text-gray-500">Email can't be changed. If it is wrong, remove them and add them again with the right one.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-member-name" className="text-sm text-gray-300">Full name</label>
          <input
            id="edit-member-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={200}
            className={INPUT_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="edit-member-phone" className="text-sm text-gray-300">Phone <span className="text-gray-500">(optional)</span></label>
          <input
            id="edit-member-phone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            maxLength={30}
            inputMode="tel"
            className={INPUT_CLASS}
          />
        </div>
        {role === 'mentor' && (
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} className="accent-gold w-4 h-4" />
            External mentor
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" isLoading={saving} disabled={!fullName.trim()}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The admins or mentors on the platform, with Edit and Remove. refreshKey
 * changes when someone is added above, so the list picks them up.
 */
export default function MemberList({ role, refreshKey }: { role: StaffRole; refreshKey: number }) {
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const copy = COPY[role];

  const [rows, setRows] = useState<StaffMember[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListStaff(role, { page, limit, search: search || undefined });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : `Could not load ${copy.title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [role, page, limit, search, copy.title, showError]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleRemove = async (member: StaffMember) => {
    const confirmed = await confirm({
      title: `Remove ${copy.noun}`,
      message: `Remove ${member.fullName} (${member.email}) as ${copy.noun}? ${copy.removeNote} Adding them again later restores them.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiRemoveStaff(role, member.id);
      showSuccess(`${member.fullName} removed as ${copy.noun}`);
      // A page left empty by the removal steps back one.
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      // The server says why: yourself, the last admin, or teams still assigned.
      showError(err instanceof Error ? err.message : 'Could not remove');
    }
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Name',
      render: (m: StaffMember) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-white font-medium">{m.fullName}</span>
          {(role === 'admin' ? m.isMentor : m.isAdmin) && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/25">
              {copy.alsoLabel}
            </span>
          )}
          {m.id === user?.id && <span className="text-[11px] text-gray-500">(you)</span>}
        </div>
      ),
    },
    { key: 'email', header: 'Email' },
    { key: 'phoneNumber', header: 'Phone', render: (m: StaffMember) => m.phoneNumber ?? '—' },
    ...(role === 'mentor'
      ? [{ key: 'isExternal', header: 'Type', render: (m: StaffMember) => (m.isExternal ? 'External' : 'Internal') }]
      : []),
    {
      key: 'createdAt',
      header: 'Added',
      render: (m: StaffMember) => <span className="whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{copy.title}</h2>
      <DataTable<StaffMember>
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search by name or email..."
        onSearchChange={handleSearchChange}
        hideExport
        actions={(m) => (
          <ActionsMenu
            items={[
              { label: 'Edit', icon: Pencil, onClick: () => setEditing(m) },
              // Removing yourself is refused on the server too; it is not offered.
              ...(m.id === user?.id ? [] : [{ label: 'Remove', icon: Trash2, onClick: () => handleRemove(m), danger: true }]),
            ]}
          />
        )}
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: setPage,
          onLimitChange: (value) => {
            setPage(1);
            setLimit(value);
          },
        }}
      />
      {editing && (
        <EditMemberModal
          key={editing.id}
          role={role}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
