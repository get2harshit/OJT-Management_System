import DataTable from '../../components/DataTable';
import type { Credit, Profile } from '../../lib/types';

interface Props {
  credits: Credit[];
  profiles: Profile[];
}

export default function MentorCredits({ credits, profiles }: Props) {
  const data = credits.map((c) => {
    const student = profiles.find((p) => p.id === c.student_id);
    return {
      ...c,
      student_name: student?.name ?? '-',
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Cloud Credits</h1>
        <p className="text-gray-400 text-sm mt-1">View assigned cloud provider vouchers</p>
      </div>

      <DataTable
        columns={[
          { key: 'student_name', header: 'Student' },
          { key: 'provider', header: 'Provider' },
          { key: 'amount', header: 'Amount ($)' },
          { key: 'code', header: 'Code' },
          { key: 'expiry_date', header: 'Expiry' },
        ]}
        data={data}
        searchPlaceholder="Search credits..."
      />
    </div>
  );
}
