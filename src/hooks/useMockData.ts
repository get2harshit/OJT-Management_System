import { useState, useEffect } from 'react';
import type { Profile, Semester, Batch, Student, Task, Submission, Credit, Attendance, Comment } from '../lib/types';

const mockProfiles: Profile[] = [
  { id: 'a1', email: 'admin@ojt.edu', name: 'Admin User', role: 'ADMIN', created_at: '2024-01-01' },
  { id: 'm1', email: 'mentor1@ojt.edu', name: 'Dr. Sarah Chen', role: 'MENTOR', created_at: '2024-01-01' },
  { id: 'm2', email: 'mentor2@ojt.edu', name: 'Prof. James Wilson', role: 'MENTOR', created_at: '2024-01-01' },
  { id: 'm3', email: 'mentor3@ojt.edu', name: 'Dr. Priya Patel', role: 'MENTOR', created_at: '2024-01-01' },
  { id: 's1', email: 'student1@ojt.edu', name: 'Alice Johnson', role: 'STUDENT', created_at: '2024-01-01' },
  { id: 's2', email: 'student2@ojt.edu', name: 'Bob Smith', role: 'STUDENT', created_at: '2024-01-01' },
  { id: 's3', email: 'student3@ojt.edu', name: 'Charlie Davis', role: 'STUDENT', created_at: '2024-01-01' },
  { id: 's4', email: 'student4@ojt.edu', name: 'Diana Lee', role: 'STUDENT', created_at: '2024-01-01' },
  { id: 's5', email: 'student5@ojt.edu', name: 'Ethan Brown', role: 'STUDENT', created_at: '2024-01-01' },
  { id: 's6', email: 'student6@ojt.edu', name: 'Fiona Clark', role: 'STUDENT', created_at: '2024-01-01' },
];

const mockSemesters: Semester[] = [
  { id: 'sem1', name: 'Fall 2024', start_date: '2024-09-01', end_date: '2024-12-20', is_active: true, created_at: '2024-08-01' },
  { id: 'sem2', name: 'Spring 2025', start_date: '2025-01-15', end_date: '2025-05-15', is_active: false, created_at: '2024-08-01' },
];

const mockBatches: Batch[] = [
  { id: 'b1', name: 'Batch A', semester_id: 'sem1', created_at: '2024-09-01' },
  { id: 'b2', name: 'Batch B', semester_id: 'sem1', created_at: '2024-09-01' },
];

const mockStudents: Student[] = [
  { user_id: 's1', roll_number: 'OJT-2024-001', batch_id: 'b1' },
  { user_id: 's2', roll_number: 'OJT-2024-002', batch_id: 'b1' },
  { user_id: 's3', roll_number: 'OJT-2024-003', batch_id: 'b1' },
  { user_id: 's4', roll_number: 'OJT-2024-004', batch_id: 'b2' },
  { user_id: 's5', roll_number: 'OJT-2024-005', batch_id: 'b2' },
  { user_id: 's6', roll_number: 'OJT-2024-006', batch_id: 'b2' },
];

const mockTasks: Task[] = [
  { id: 't1', title: 'Cloud Fundamentals', description: 'Learn cloud basics', is_common: true, mentor_id: null, due_date: '2024-10-15', created_at: '2024-09-01' },
  { id: 't2', title: 'AWS EC2 Setup', description: 'Deploy a VM', is_common: true, mentor_id: null, due_date: '2024-10-20', created_at: '2024-09-01' },
  { id: 't3', title: 'VPC Configuration', description: 'Set up networking', is_common: false, mentor_id: 'm1', due_date: '2024-10-25', created_at: '2024-09-05' },
  { id: 't4', title: 'S3 Storage Lab', description: 'Object storage practice', is_common: false, mentor_id: 'm2', due_date: '2024-10-30', created_at: '2024-09-05' },
];

const mockSubmissions: Submission[] = [
  { id: 'sub1', task_id: 't1', student_id: 's1', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'ACCEPTED', submitted_at: '2024-09-20' },
  { id: 'sub2', task_id: 't1', student_id: 's2', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'PENDING', submitted_at: '2024-09-21' },
  { id: 'sub3', task_id: 't2', student_id: 's1', version: 1, file_url: '#', file_name: 'ec2_lab_v1.pdf', status: 'RETURNED', submitted_at: '2024-09-22' },
  { id: 'sub4', task_id: 't3', student_id: 's1', version: 1, file_url: '#', file_name: 'vpc_config_v1.pdf', status: 'PENDING', submitted_at: '2024-09-23' },
  { id: 'sub5', task_id: 't1', student_id: 's3', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'ACCEPTED', submitted_at: '2024-09-24' },
  { id: 'sub6', task_id: 't2', student_id: 's3', version: 1, file_url: '#', file_name: 'ec2_lab_v1.pdf', status: 'PENDING', submitted_at: '2024-09-25' },
];

const mockCredits: Credit[] = [
  { id: 'c1', student_id: 's1', provider: 'AWS', amount: 100, code: 'AWS-CREDIT-001', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c2', student_id: 's1', provider: 'GCP', amount: 150, code: 'GCP-CREDIT-002', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c3', student_id: 's2', provider: 'AWS', amount: 100, code: 'AWS-CREDIT-003', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c4', student_id: 's3', provider: 'VULTR', amount: 50, code: 'VULTR-CREDIT-004', expiry_date: '2025-03-01', assigned_at: '2024-09-01' },
];

const mockAttendance: Attendance[] = [
  { id: 'att1', student_id: 's1', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att2', student_id: 's1', date: '2024-09-21', marked_at: '2024-09-21' },
  { id: 'att3', student_id: 's1', date: '2024-09-22', marked_at: '2024-09-22' },
  { id: 'att4', student_id: 's2', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att5', student_id: 's2', date: '2024-09-21', marked_at: '2024-09-21' },
  { id: 'att6', student_id: 's3', date: '2024-09-20', marked_at: '2024-09-20' },
];

const mockComments: Comment[] = [
  { id: 'com1', submission_id: 'sub1', author_id: 'm1', content: 'Great work on the fundamentals! Keep it up.', created_at: '2024-09-21' },
  { id: 'com2', submission_id: 'sub3', author_id: 'm1', content: 'Please fix the security group rules and resubmit.', created_at: '2024-09-23' },
  { id: 'com3', submission_id: 'sub3', author_id: 's1', content: 'Fixed the rules, uploading v2 now.', created_at: '2024-09-24' },
];

export function useMockData() {
  const [profiles] = useState<Profile[]>(mockProfiles);
  const [semesters] = useState<Semester[]>(mockSemesters);
  const [batches] = useState<Batch[]>(mockBatches);
  const [students] = useState<Student[]>(mockStudents);
  const [tasks] = useState<Task[]>(mockTasks);
  const [submissions] = useState<Submission[]>(mockSubmissions);
  const [credits] = useState<Credit[]>(mockCredits);
  const [attendance] = useState<Attendance[]>(mockAttendance);
  const [comments] = useState<Comment[]>(mockComments);

  return {
    profiles,
    semesters,
    batches,
    students,
    tasks,
    submissions,
    credits,
    attendance,
    comments,
  };
}
