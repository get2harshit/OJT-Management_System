import { useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Button from '../../../components/Button';
import { apiAddAdmin, apiAddMentor, type AddedMember } from '../../../lib/api';
import { useToast } from '../../../toast';

type StaffRole = 'admin' | 'mentor';

const INPUT_CLASS =
  'w-full bg-zinc-750 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold focus-visible:ring-1 focus-visible:ring-gold/60';

const COPY: Record<StaffRole, { action: string; added: (name: string) => string; next: string }> = {
  admin: {
    action: 'Add admin',
    added: (name) => `${name} is now an admin`,
    next: 'They have access to every OJT as soon as they sign in.',
  },
  mentor: {
    action: 'Add mentor',
    added: (name) => `${name} is now a mentor`,
    next: 'Next, set their tracks in Mentor Directory and add them to an OJT from its Mentors tab — until then they have no teams.',
  },
};

const MENTOR_KINDS = [
  { value: false, label: 'Internal' },
  { value: true, label: 'External' },
] as const;

export default function StaffMemberForm({ role }: { role: StaffRole }) {
  const { showSuccess, showError } = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<AddedMember | null>(null);
  const copy = COPY[role];

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    // The last confirmation is about someone else; leaving it up beside a
    // failed attempt reads as if this one had worked.
    setLastAdded(null);
    try {
      const added =
        role === 'admin'
          ? await apiAddAdmin({ fullName, email })
          : await apiAddMentor({ fullName, email, isExternal });
      setLastAdded(added);
      showSuccess(copy.added(added.fullName));
      setFullName('');
      setEmail('');
      setIsExternal(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : `Could not ${copy.action.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={`${role}-name`} className="text-sm text-gray-300">
            Full name
          </label>
          <input
            id={`${role}-name`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${role}-email`} className="text-sm text-gray-300">
            Email they sign in with
          </label>
          <input
            id={`${role}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            autoComplete="off"
            placeholder={role === 'admin' ? 'name@polariscampus.com' : 'name@company.com'}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-gray-500">Their Google account for this address. University addresses are for students only.</p>
        </div>

        {role === 'mentor' && (
          <fieldset className="space-y-1.5">
            <legend className="text-sm text-gray-300">Mentor type</legend>
            <div className="grid grid-cols-2 gap-1.5 max-w-xs" role="radiogroup" aria-label="Mentor type">
              {MENTOR_KINDS.map(({ value, label }) => {
                const selected = isExternal === value;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setIsExternal(value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 ${
                      selected
                        ? 'bg-gold text-black border-gold'
                        : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <Button type="submit" isLoading={saving} disabled={!fullName.trim() || !email.trim()}>
          {copy.action}
        </Button>
      </form>

      {lastAdded && (
        <div className="flex gap-3 rounded-xl border border-green-500/25 bg-green-500/10 p-4" role="status">
          <CheckCircle2 size={18} className="text-green-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="text-white font-semibold">{copy.added(lastAdded.fullName)}</p>
            <p className="text-gray-300">
              They sign in with Google as <span className="text-white">{lastAdded.email}</span>.{' '}
              {lastAdded.newAccount ? 'A sign-in account was created for them.' : 'Their existing sign-in account was used.'}
            </p>
            <p className="text-gray-400">{copy.next}</p>
          </div>
        </div>
      )}
    </div>
  );
}
