import DataTable from '../../components/DataTable';
import type { Profile, Student, Batch } from '../../lib/types';
import { useStudentProfiles } from '../../hooks/useStudentProfiles';

import { useData } from '../../context/DataContext';

interface Props {
  profiles: Profile[];
  students: Student[];
  batches: Batch[];
}

export default function MentorStudents({
  profiles: propProfiles,
  students: propStudents,
  batches: propBatches,
}: Partial<Props> = {}) {
  const { profiles: hookProfiles, students: hookStudents, batches: hookBatches } = useData();

  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const batches = propBatches ?? hookBatches;
  const studentProfiles = useStudentProfiles(profiles);

  const data = students.map((s) => {
    const prof = studentProfiles.find((p) => p.id === s.user_id);
    const batch = batches.find((b) => b.id === s.batch_id);
    return {
      user_id: s.user_id,
      name: prof?.name ?? '-',
      email: prof?.email ?? '-',
      roll_number: s.roll_number,
      batch: batch?.name ?? '-',
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">My Students</h1>
        <p className="text-gray-400 text-sm mt-1">View your assigned students</p>
      </div>

      <DataTable
        columns={[
          { key: 'roll_number', header: 'Roll Number' },
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'batch', header: 'Batch' },
        ]}
        data={data}
        searchPlaceholder="Search students..."
      />
    </div>
  );
}
