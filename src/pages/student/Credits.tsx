import DataTable from '../../components/DataTable';
import type { Credit, Profile } from '../../lib/types';

interface Props {
  studentId: string;
  credits: Credit[];
  profiles: Profile[];
}

export default function StudentCredits({ studentId, credits, profiles }: Props) {
  const myCredits = credits.filter((c) => c.student_id === studentId);

  const data = myCredits.map((c) => {
    const student = profiles.find((p) => p.id === c.student_id);
    return {
      ...c,
      student_name: student?.name ?? '-',
    };
  }); 

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">My Cloud Credits</h1>
        <p className="text-gray-400 text-sm mt-1">View your assigned cloud provider vouchers</p>
      </div>

      <DataTable
        columns={[
          { key: 'provider', header: 'Provider' },
          { key: 'amount', header: 'Amount ($)' },
          { key: 'code', header: 'Voucher Code' },
          { key: 'expiry_date', header: 'Expiry Date' },
          { key: 'assigned_at', header: 'Assigned' },
        ]}
        data={data}
        searchPlaceholder="Search credits..."
      />
    </div>
  );
}
