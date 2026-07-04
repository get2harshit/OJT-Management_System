import { useState, useEffect } from 'react';
import DataTable from '../../components/DataTable';
import SpinnerSquare from '../../spinner/logoSpinner';
import type { ApiStudent } from '../../lib/types';
import { apiListStudents } from '../../lib/api';

// Real backend roster (GET /api/v1/students, unfiltered). The backend has no
// create/update/delete endpoints for students yet — only self-signup creates
// one — so this page is read-only until those exist.
export default function AdminStudents() {
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiListStudents()
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  const data = students.map(s => ({
    id: s.id,
    roll_number: s.rollNumber ?? '-',
    name: s.fullName ?? '-',
    email: s.email ?? '-',
    batch: s.batch ?? '-',
    currentTier: s.currentTier ?? '-',
    activeStatus: s.activeStatus,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Students</h1>
        <p className="text-gray-400 text-sm mt-1">All enrolled students</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'roll_number', header: 'Roll Number' },
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'batch', header: 'Batch' },
            { key: 'currentTier', header: 'Tier' },
            {
              key: 'activeStatus',
              header: 'Status',
              render: (row: any) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  row.activeStatus === false ? 'bg-gray-400/10 text-gray-400' : 'bg-green-400/10 text-green-400'
                }`}>
                  {row.activeStatus === false ? 'Inactive' : 'Active'}
                </span>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search students..."
        />
      )}
    </div>
  );
}
