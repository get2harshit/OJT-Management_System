import { useState, useMemo } from 'react';
import { Check, X, AlertTriangle, Calendar, Users, CheckCircle, XCircle } from 'lucide-react';
import DataTable from '../../components/DataTable';
import type { Attendance, Profile, Student } from '../../lib/types';
import { useStudentProfiles } from '../../hooks/useStudentProfiles';

import { useAttendance } from '../../hooks/useAttendance';
import { useData } from '../../context/DataContext';

interface Props {
  attendance: Attendance[];
  profiles: Profile[];
  students: Student[];
  toggleAttendance: (studentId: string, date: string, isPresent: boolean) => void;
  markAllAttendance: (date: string, studentIds: string[], isPresent: boolean) => void;
}

export default function AdminAttendance({
  attendance: propAttendance,
  profiles: propProfiles,
  students: propStudents,
  toggleAttendance: propToggleAttendance,
  markAllAttendance: propMarkAllAttendance,
}: Partial<Props> = {}) {
  const { attendance: hookAttendance, toggleAttendance: hookToggleAttendance, markAllAttendance: hookMarkAllAttendance } = useAttendance();
  const { profiles: hookProfiles, students: hookStudents } = useData();

  const attendance = propAttendance ?? hookAttendance;
  const profiles = propProfiles ?? hookProfiles;
  const students = propStudents ?? hookStudents;
  const toggleAttendance = propToggleAttendance ?? hookToggleAttendance;
  const markAllAttendance = propMarkAllAttendance ?? hookMarkAllAttendance;
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const studentProfiles = useStudentProfiles(profiles);

  // Compute overall unique attendance dates in the database
  const totalUniqueDates = useMemo(() => {
    return new Set(attendance.map((a) => a.date)).size;
  }, [attendance]);

  const targetDenominator = Math.max(totalUniqueDates, 5); // default base to avoid 0 div and represent realistic scale

  // Compute attendance stats for each student
  const studentStats = useMemo(() => {
    return students.map((s) => {
      const prof = studentProfiles.find((p) => p.id === s.user_id);
      const studentPresents = attendance.filter((a) => a.student_id === s.user_id).length;
      const pct = Math.round((studentPresents / targetDenominator) * 100);
      return {
        user_id: s.user_id,
        name: prof?.name ?? '-',
        roll_number: s.roll_number,
        presentDays: studentPresents,
        totalDays: targetDenominator,
        percentage: pct,
        isLowAttendance: pct < 75,
      };
    });
  }, [students, studentProfiles, attendance, targetDenominator]);

  // Combine daily attendance and student statistics in a single dataset
  const dailyAttendanceList = useMemo(() => {
    return students.map((s) => {
      const prof = studentProfiles.find((p) => p.id === s.user_id);
      const stats = studentStats.find((st) => st.user_id === s.user_id);
      const isPresent = attendance.some((a) => a.student_id === s.user_id && a.date === selectedDate);
      return {
        user_id: s.user_id,
        name: prof?.name ?? '-',
        roll_number: s.roll_number ?? '-',
        percentage: stats?.percentage ?? 0,
        isPresent,
        isLowAttendance: (stats?.percentage ?? 0) < 75,
      };
    });
  }, [students, studentProfiles, studentStats, attendance, selectedDate]);

  // Stats for the active day
  const totalStudentsCount = dailyAttendanceList.length;
  const presentCount = dailyAttendanceList.filter((x) => x.isPresent).length;
  const absentCount = totalStudentsCount - presentCount;
  const dailyAttendanceRate = totalStudentsCount
    ? Math.round((presentCount / totalStudentsCount) * 100)
    : 0;

  const handleMarkAllPresent = () => {
    const studentIds = students.map((s) => s.user_id);
    markAllAttendance(selectedDate, studentIds, true);
  };

  const handleMarkAllAbsent = () => {
    const studentIds = students.map((s) => s.user_id);
    markAllAttendance(selectedDate, studentIds, false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Attendance Sheets</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage live daily attendance status, apply bulk changes, and review overall statistics.
        </p>
      </div>

      {/* Daily Metrics Dashboard Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Total Students</span>
            <span className="text-2xl font-bold text-white mt-1 block">{totalStudentsCount}</span>
          </div>
          <div className="p-3 bg-zinc-750 rounded-lg">
            <Users size={20} className="text-gold" />
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Present Today</span>
            <span className="text-2xl font-bold text-green-400 mt-1 block">{presentCount}</span>
          </div>
          <div className="p-3 bg-green-500/10 rounded-lg">
            <CheckCircle size={20} className="text-green-400" />
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Absent Today</span>
            <span className="text-2xl font-bold text-red-400 mt-1 block">{absentCount}</span>
          </div>
          <div className="p-3 bg-red-500/10 rounded-lg">
            <XCircle size={20} className="text-red-400" />
          </div>
        </div>

        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider block">Attendance Rate</span>
            <span className="text-2xl font-bold text-gold mt-1 block">{dailyAttendanceRate}%</span>
          </div>
          <div className="p-3 bg-gold/10 rounded-lg">
            <Calendar size={20} className="text-gold" />
          </div>
        </div>
      </div>

      {/* Main Single Sheet Panel */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
        {/* Header Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-750">
          <div>
            <h2 className="text-lg font-bold text-white">Daily Attendance Mark Sheet</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select a date and manage present/absent status</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Select */}
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-zinc-900 border border-zinc-750 rounded-lg pl-3 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gold w-40"
              />
            </div>

            {/* Bulk Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleMarkAllPresent}
                className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Check size={14} />
                Mark All Present
              </button>
              <button
                onClick={handleMarkAllAbsent}
                className="px-3.5 py-2 bg-zinc-750 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg border border-zinc-650 transition-colors flex items-center gap-1.5"
              >
                <X size={14} />
                Mark All Absent
              </button>
            </div>
          </div>
        </div>

        <DataTable
          columns={[
            {
              key: 'roll_number',
              header: 'Roll Number',
              render: (row) => <span className="font-mono text-gray-300 text-xs">{row.roll_number}</span>,
            },
            {
              key: 'name',
              header: 'Student Name',
              render: (row) => <span className="font-semibold text-white">{row.name}</span>,
            },
            {
              key: 'percentage',
              header: 'Cumulative rate',
              render: (row) => (
                <span className={`font-semibold ${row.isLowAttendance ? 'text-amber-500' : 'text-green-400'}`}>
                  {row.percentage}%
                </span>
              ),
            },
            {
              key: 'isLowAttendance',
              header: 'Alert Status',
              render: (row) =>
                row.isLowAttendance ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <AlertTriangle size={12} />
                    Low Attendance Alert
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                    Good Standing
                  </span>
                ),
            },
          ]}
          data={dailyAttendanceList}
          searchPlaceholder="Search student or roll number..."
          searchKeys={['name', 'roll_number']}
          actions={(row) => (
            <div className="inline-flex rounded-lg p-0.5 bg-zinc-950 border border-zinc-850 gap-0.5">
              <button
                onClick={() => toggleAttendance(row.user_id, selectedDate, true)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                  row.isPresent
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-zinc-850'
                }`}
              >
                <Check size={12} />
                Present
              </button>
              <button
                onClick={() => toggleAttendance(row.user_id, selectedDate, false)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                  !row.isPresent
                    ? 'bg-zinc-750 text-red-400 shadow-sm border border-red-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-zinc-850'
                }`}
              >
                <X size={12} />
                Absent
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
