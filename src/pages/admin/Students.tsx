import { useState, useEffect, useMemo } from 'react';
import DataTable from '../../components/DataTable';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import type { ApiStudent } from '../../lib/types';
import { apiListStudents } from '../../lib/api';

// Real backend roster (GET /api/v1/students, unfiltered). The backend has no
// create/update/delete endpoints for students yet — only self-signup creates
// one — so this page is read-only until those exist.
export default function AdminStudents() {
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState('');

  useEffect(() => {
    apiListStudents()
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  // Unique sorted batch values from the API data
  const batches = useMemo(() => {
    const vals = students.map(s => s.batch).filter((b): b is string => !!b && b !== '-');
    return Array.from(new Set(vals)).sort();
  }, [students]);

  const filtered = useMemo(() => {
    return selectedBatch
      ? students.filter(s => s.batch === selectedBatch)
      : students;
  }, [students, selectedBatch]);

  const data = filtered.map(s => ({
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

      {!loading && batches.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select
            variant="filter"
            className="min-w-[160px]"
            value={selectedBatch}
            onChange={setSelectedBatch}
            placeholder="All Batches"
            options={batches.map(b => ({ value: b, label: b }))}
          />
        </div>
      )}

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
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
