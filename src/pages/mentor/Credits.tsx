import { useMemo } from 'react';
import { Cloud, Check, X, ShieldAlert, Award } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { CreditRequest, Profile, Student } from '../../lib/types';

import { useCredits } from '../../hooks/useCredits';
import { useData } from '../../context/DataContext';

interface Props {
  mentorId: string;
  creditRequests: CreditRequest[];
  profiles: Profile[];
  students: Student[];
  vouchCreditRequest: (id: string, status: 'VOUCHED' | 'REJECTED') => void;
}

export default function MentorCredits({
  mentorId,
  creditRequests: propCreditRequests,
  profiles: propProfiles,
  students: propStudents,
  vouchCreditRequest: propVouchCreditRequest,
}: Props) {
  const { creditRequests: hookCreditRequests, vouchCreditRequest: hookVouchCreditRequest } = useCredits();
  const { profiles: hookProfiles, students: hookStudents } = useData();

  const creditRequests = propCreditRequests ?? hookCreditRequests;
  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const vouchCreditRequest = propVouchCreditRequest ?? hookVouchCreditRequest;
  // Find all students assigned to this mentor
  const myStudentIds = useMemo(() => {
    return new Set(students.filter(s => s.mentor_id === mentorId).map(s => s.user_id));
  }, [students, mentorId]);

  // Filter requests belonging to this mentor's students
  const filteredRequests = useMemo(() => {
    return creditRequests.filter(r => myStudentIds.has(r.student_id));
  }, [creditRequests, myStudentIds]);

  const tableData = useMemo(() => {
    return filteredRequests.map(r => {
      const studentProfile = profiles.find(p => p.id === r.student_id);
      const student = students.find(s => s.user_id === r.student_id);
      return {
        ...r,
        student_name: studentProfile?.name ?? '-',
        roll_number: student?.roll_number ?? '-',
      };
    });
  }, [filteredRequests, profiles, students]);

  const pendingRequests = tableData.filter(r => r.mentor_status === 'PENDING');
  const historyRequests = tableData.filter(r => r.mentor_status !== 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Cloud className="text-gold" size={26} />
          Student Credit Requests
        </h1>
        <p className="text-gray-400 text-sm mt-1">Review and verify (vouch for) cloud provider credit requests from your students before sending to admin</p>
      </div>

      {/* Pending Vouchers Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-yellow-500 flex items-center gap-2">
          <ShieldAlert size={18} />
          Awaiting Mentor Verification ({pendingRequests.length})
        </h2>
        <DataTable
          columns={[
            { key: 'student_name', header: 'Student' },
            { key: 'roll_number', header: 'Roll Number' },
            { key: 'provider', header: 'Provider' },
            { key: 'amount', header: 'Requested ($)' },
            { key: 'reason', header: 'Justification Reason' },
            { key: 'created_at', header: 'Requested Date' },
          ]}
          data={pendingRequests}
          searchPlaceholder="Search pending credit requests..."
          actions={(row) => (
            <div className="flex items-center gap-2">
              <button
                onClick={() => vouchCreditRequest(row.id, 'VOUCHED')}
                className="p-1 px-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 text-xs font-semibold rounded flex items-center gap-1 transition-all"
              >
                <Check size={14} />
                Vouch
              </button>
              <button
                onClick={() => vouchCreditRequest(row.id, 'REJECTED')}
                className="p-1 px-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold rounded flex items-center gap-1 transition-all"
              >
                <X size={14} />
                Reject
              </button>
            </div>
          )}
        />
      </div>

      {/* History section */}
      <div className="space-y-3 pt-6 border-t border-zinc-750">
        <h2 className="text-lg font-bold text-gray-300 flex items-center gap-2">
          <Award size={18} />
          Verification History
        </h2>
        <DataTable
          columns={[
            { key: 'student_name', header: 'Student' },
            { key: 'roll_number', header: 'Roll Number' },
            { key: 'provider', header: 'Provider' },
            { key: 'amount', header: 'Requested ($)' },
            { key: 'reason', header: 'Reason' },
            { key: 'mentor_status', header: 'Vouch Status', render: (row) => (
              <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                row.mentor_status === 'VOUCHED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>{row.mentor_status}</span>
            )},
            { key: 'admin_status', header: 'Admin Status', render: (row) => (
              <span className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                row.admin_status === 'PENDING' ? 'bg-zinc-800 text-gray-400' :
                row.admin_status === 'APPROVED' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>{row.admin_status}</span>
            )},
            { key: 'created_at', header: 'Date' },
          ]}
          data={historyRequests}
          searchPlaceholder="Search history..."
        />
      </div>
    </div>
  );
}
