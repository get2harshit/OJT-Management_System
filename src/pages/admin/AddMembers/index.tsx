import { useState } from 'react';
import PageLayout from '../../../components/PageLayout';
import StaffMemberForm from './StaffMemberForm';
import StudentImport from './StudentImport';

type MemberRole = 'admin' | 'mentor' | 'students';

const ROLES: { value: MemberRole; label: string; hint: string }[] = [
  { value: 'admin', label: 'Admin', hint: 'Runs every OJT on the platform.' },
  { value: 'mentor', label: 'Mentor', hint: 'Mentors teams once added to an OJT.' },
  // Student import is off until its backend fixes land — its routes are
  // unmounted, so the option is hidden rather than left to fail.
  // { value: 'students', label: 'Students', hint: 'Added in bulk from a CSV file.' },
];

/**
 * Where an admin gives a new person access. Admins and mentors are added one
 * at a time; students come in from a CSV. Everyone signs in with Google using
 * the address entered here.
 */
export default function AddMembers() {
  const [role, setRole] = useState<MemberRole>('admin');
  const current = ROLES.find((r) => r.value === role)!;

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Add members</h1>
        <p className="text-gray-400 text-sm mt-1">Give someone access. They sign in with Google using the email you enter here.</p>
      </div>

      <div className="space-y-2">
        <div className="inline-flex rounded-xl border border-zinc-750 bg-zinc-900 p-1" role="radiogroup" aria-label="Who are you adding?">
          {ROLES.map(({ value, label }) => {
            const selected = role === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRole(value)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 ${
                  selected ? 'bg-gold text-black' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">{current.hint}</p>
      </div>

      <section className={`rounded-2xl border border-zinc-750 bg-zinc-850 p-5 ${role === 'students' ? '' : 'max-w-2xl'}`}>
        {/* Keyed so switching role starts the form clean rather than carrying a half-typed name across. */}
        {role === 'students' ? <StudentImport /> : <StaffMemberForm key={role} role={role} />}
      </section>
    </PageLayout>
  );
}
