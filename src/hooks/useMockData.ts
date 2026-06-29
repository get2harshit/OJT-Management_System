import { useState, useCallback } from 'react';
import type {
  Profile, Semester, Batch, Student, Task, Submission, Credit, Attendance, Comment,
  OJT, Project,
} from '../lib/types';

// ─── Default Mock Data ──────────────────────────────────────────────────────────

const defaultProfiles: Profile[] = [
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

const defaultSemesters: Semester[] = [
  { id: 'sem1', name: 'Fall 2024', start_date: '2024-09-01', end_date: '2024-12-20', is_active: true, created_at: '2024-08-01' },
  { id: 'sem2', name: 'Spring 2025', start_date: '2025-01-15', end_date: '2025-05-15', is_active: false, created_at: '2024-08-01' },
];

const defaultBatches: Batch[] = [
  { id: 'b1', name: 'Batch A', semester_id: 'sem1', created_at: '2024-09-01' },
  { id: 'b2', name: 'Batch B', semester_id: 'sem1', created_at: '2024-09-01' },
  { id: 'b3', name: 'Batch C', semester_id: 'sem2', created_at: '2025-01-15' },
];

const defaultStudents: Student[] = [
  { user_id: 's1', roll_number: 'OJT-2024-001', batch_id: 'b1', semester_id: 'sem1', track: 'Cloud Computing', ojt_id: 'ojt1', project_id: 'p1', viva1: 85, viva2: 78, viva3: null, ojt_marks: 72 },
  { user_id: 's2', roll_number: 'OJT-2024-002', batch_id: 'b1', semester_id: 'sem1', track: 'Cloud Computing', ojt_id: 'ojt1', project_id: 'p2', viva1: 70, viva2: null, viva3: null, ojt_marks: null },
  { user_id: 's3', roll_number: 'OJT-2024-003', batch_id: 'b1', semester_id: 'sem1', track: 'DevOps', ojt_id: 'ojt1', project_id: null, viva1: 92, viva2: 88, viva3: 90, ojt_marks: 85 },
  { user_id: 's4', roll_number: 'OJT-2024-004', batch_id: 'b2', semester_id: 'sem1', track: 'DevOps', ojt_id: null, project_id: null, viva1: null, viva2: null, viva3: null, ojt_marks: null },
  { user_id: 's5', roll_number: 'OJT-2024-005', batch_id: 'b2', semester_id: 'sem2', track: 'Full Stack', ojt_id: null, project_id: null, viva1: 60, viva2: 55, viva3: null, ojt_marks: null },
  { user_id: 's6', roll_number: 'OJT-2024-006', batch_id: 'b3', semester_id: 'sem2', track: 'Full Stack', ojt_id: null, project_id: null, viva1: null, viva2: null, viva3: null, ojt_marks: null },
];

const defaultOJTs: OJT[] = [
  { id: 'ojt1', name: 'OJT Program — Fall 2024', start_date: '2024-09-15', end_date: '2024-12-15', created_at: '2024-09-01' },
  { id: 'ojt2', name: 'OJT Program — Spring 2025', start_date: '2025-02-01', end_date: '2025-05-01', created_at: '2025-01-15' },
];

const defaultProjects: Project[] = [
  { id: 'p1', title: 'AWS Infrastructure Automation', description: 'Build automated infrastructure provisioning using Terraform and AWS.', track: 'Cloud Computing', created_at: '2024-09-05' },
  { id: 'p2', title: 'GCP Kubernetes Deployment', description: 'Deploy a multi-tier application on GKE.', track: 'Cloud Computing', created_at: '2024-09-05' },
  { id: 'p3', title: 'CI/CD Pipeline Design', description: 'Design a full CI/CD pipeline using GitHub Actions.', track: 'DevOps', created_at: '2024-09-05' },
];

const defaultTasks: Task[] = [
  { id: 't1', title: 'Cloud Fundamentals', description: 'Learn cloud basics', type: 'STUDENT_SPECIFIC', assigned_to: null, mentor_id: null, start_date: '2024-09-01', due_date: '2024-10-15', created_at: '2024-09-01' },
  { id: 't2', title: 'AWS EC2 Setup', description: 'Deploy a VM', type: 'STUDENT_SPECIFIC', assigned_to: 's1', mentor_id: null, start_date: '2024-09-10', due_date: '2024-10-20', created_at: '2024-09-01' },
  { id: 't3', title: 'VPC Configuration', description: 'Set up networking', type: 'MENTOR_SPECIFIC', assigned_to: 'm1', mentor_id: 'm1', start_date: '2024-09-15', due_date: '2024-10-25', created_at: '2024-09-05' },
  { id: 't4', title: 'S3 Storage Lab', description: 'Object storage practice', type: 'STUDENT_SPECIFIC', assigned_to: 's3', mentor_id: 'm2', start_date: '2024-09-20', due_date: '2024-10-30', created_at: '2024-09-05' },
  { id: 't5', title: 'Weekly Progress Report', description: 'Submit weekly report to mentor', type: 'MENTOR_SPECIFIC', assigned_to: null, mentor_id: null, start_date: '2024-09-01', due_date: '2024-12-20', created_at: '2024-09-01' },
];

const defaultSubmissions: Submission[] = [
  { id: 'sub1', task_id: 't1', student_id: 's1', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'ACCEPTED', category: 'PRD', submitted_at: '2024-09-20' },
  { id: 'sub2', task_id: 't1', student_id: 's2', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'PENDING', category: 'PRD', submitted_at: '2024-09-21' },
  { id: 'sub3', task_id: 't2', student_id: 's1', version: 1, file_url: '#', file_name: 'ec2_lab_v1.pdf', status: 'RETURNED', category: 'SPECIFIC_TASK', submitted_at: '2024-09-22' },
  { id: 'sub4', task_id: 't3', student_id: 's1', version: 1, file_url: '#', file_name: 'vpc_config_v1.pdf', status: 'PENDING', category: 'SPECIFIC_TASK', submitted_at: '2024-09-23' },
  { id: 'sub5', task_id: 't1', student_id: 's3', version: 1, file_url: '#', file_name: 'cloud_basics_v1.pdf', status: 'ACCEPTED', category: 'COMMON_TASK', submitted_at: '2024-09-24' },
  { id: 'sub6', task_id: 't2', student_id: 's3', version: 1, file_url: '#', file_name: 'ec2_demo.mp4', status: 'PENDING', category: 'VIDEO', submitted_at: '2024-09-25' },
  { id: 'sub7', task_id: 't5', student_id: 's1', version: 1, file_url: '#', file_name: 'weekly_report_w1.pdf', status: 'ACCEPTED', category: 'COMMON_TASK', submitted_at: '2024-09-26' },
];

const defaultCredits: Credit[] = [
  { id: 'c1', student_id: 's1', provider: 'AWS', amount: 100, code: 'AWS-CREDIT-001', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c2', student_id: 's1', provider: 'GCP', amount: 150, code: 'GCP-CREDIT-002', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c3', student_id: 's2', provider: 'AWS', amount: 100, code: 'AWS-CREDIT-003', expiry_date: '2025-06-01', assigned_at: '2024-09-01' },
  { id: 'c4', student_id: 's3', provider: 'VULTR', amount: 50, code: 'VULTR-CREDIT-004', expiry_date: '2025-03-01', assigned_at: '2024-09-01' },
];

const defaultAttendance: Attendance[] = [
  { id: 'att1', student_id: 's1', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att2', student_id: 's1', date: '2024-09-21', marked_at: '2024-09-21' },
  { id: 'att3', student_id: 's1', date: '2024-09-22', marked_at: '2024-09-22' },
  { id: 'att4', student_id: 's1', date: '2024-09-23', marked_at: '2024-09-23' },
  { id: 'att5', student_id: 's1', date: '2024-09-24', marked_at: '2024-09-24' },
  { id: 'att6', student_id: 's2', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att7', student_id: 's2', date: '2024-09-21', marked_at: '2024-09-21' },
  { id: 'att8', student_id: 's3', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att9', student_id: 's4', date: '2024-09-20', marked_at: '2024-09-20' },
  { id: 'att10', student_id: 's5', date: '2024-09-20', marked_at: '2024-09-20' },
];

const defaultComments: Comment[] = [
  { id: 'com1', submission_id: 'sub1', author_id: 'm1', content: 'Great work on the fundamentals! Keep it up.', created_at: '2024-09-21' },
  { id: 'com2', submission_id: 'sub3', author_id: 'm1', content: 'Please fix the security group rules and resubmit.', created_at: '2024-09-23' },
  { id: 'com3', submission_id: 'sub3', author_id: 's1', content: 'Fixed the rules, uploading v2 now.', created_at: '2024-09-24' },
];

// ─── LocalStorage helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'ojt-management-data';

interface StoredData {
  profiles: Profile[];
  semesters: Semester[];
  batches: Batch[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  attendance: Attendance[];
  comments: Comment[];
  ojts: OJT[];
  projects: Project[];
}

function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredData;
  } catch { /* ignore parse errors */ }
  return {
    profiles: defaultProfiles,
    semesters: defaultSemesters,
    batches: defaultBatches,
    students: defaultStudents,
    tasks: defaultTasks,
    submissions: defaultSubmissions,
    credits: defaultCredits,
    attendance: defaultAttendance,
    comments: defaultComments,
    ojts: defaultOJTs,
    projects: defaultProjects,
  };
}

function saveData(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useMockData() {
  const [data, setData] = useState<StoredData>(loadData);

  const persist = useCallback((next: StoredData) => {
    setData(next);
    saveData(next);
  }, []);

  // Generic helpers
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ── OJTs ─────────────────────────────────────────────────────────────────────
  const addOJT = useCallback((ojt: Omit<OJT, 'id' | 'created_at'>) => {
    const next = { ...data, ojts: [...data.ojts, { ...ojt, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] };
    persist(next);
  }, [data, persist]);

  const deleteOJT = useCallback((id: string) => {
    persist({ ...data, ojts: data.ojts.filter(o => o.id !== id) });
  }, [data, persist]);

  // ── Projects ─────────────────────────────────────────────────────────────────
  const addProject = useCallback((proj: Omit<Project, 'id' | 'created_at'>) => {
    const next = { ...data, projects: [...data.projects, { ...proj, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] };
    persist(next);
  }, [data, persist]);

  const addProjects = useCallback((projs: Omit<Project, 'id' | 'created_at'>[]) => {
    const newProjects = projs.map(p => ({ ...p, id: uid(), created_at: new Date().toISOString().slice(0, 10) }));
    persist({ ...data, projects: [...data.projects, ...newProjects] });
  }, [data, persist]);

  const deleteProject = useCallback((id: string) => {
    persist({
      ...data,
      projects: data.projects.filter(p => p.id !== id),
      students: data.students.map(s => s.project_id === id ? { ...s, project_id: null } : s)
    });
  }, [data, persist]);

  // ── Profiles (Mentors & Students) ────────────────────────────────────────────
  const addMentor = useCallback((name: string, email: string) => {
    const id = 'm' + uid();
    const profile: Profile = { id, name, email, role: 'MENTOR', created_at: new Date().toISOString().slice(0, 10) };
    persist({ ...data, profiles: [...data.profiles, profile] });
  }, [data, persist]);

  const addMentors = useCallback((records: { name: string; email: string }[]) => {
    const newProfiles = [...data.profiles];
    records.forEach(r => {
      const id = 'm' + uid();
      newProfiles.push({
        id,
        name: r.name,
        email: r.email,
        role: 'MENTOR',
        created_at: new Date().toISOString().slice(0, 10)
      });
    });
    persist({ ...data, profiles: newProfiles });
  }, [data, persist]);

  const addStudentRecord = useCallback((name: string, email: string, roll_number: string, batch_id: string, semester_id: string, track: string) => {
    const id = 's' + uid();
    const profile: Profile = { id, name, email, role: 'STUDENT', created_at: new Date().toISOString().slice(0, 10) };
    const student: Student = {
      user_id: id,
      roll_number,
      batch_id: batch_id || null,
      semester_id: semester_id || null,
      track: track || null,
      ojt_id: null,
      project_id: null,
      viva1: null, viva2: null, viva3: null, ojt_marks: null,
    };
    persist({ ...data, profiles: [...data.profiles, profile], students: [...data.students, student] });
  }, [data, persist]);

  const addStudentRecords = useCallback((records: { name: string; email: string; roll_number: string; batch_id: string | null; semester_id: string | null; track: string | null }[]) => {
    const newProfiles = [...data.profiles];
    const newStudents = [...data.students];

    records.forEach(r => {
      const id = 's' + uid();
      newProfiles.push({
        id,
        name: r.name,
        email: r.email,
        role: 'STUDENT',
        created_at: new Date().toISOString().slice(0, 10)
      });
      newStudents.push({
        user_id: id,
        roll_number: r.roll_number,
        batch_id: r.batch_id,
        semester_id: r.semester_id,
        track: r.track,
        ojt_id: null,
        project_id: null,
        viva1: null, viva2: null, viva3: null, ojt_marks: null,
      });
    });

    persist({ ...data, profiles: newProfiles, students: newStudents });
  }, [data, persist]);

  const deleteProfile = useCallback((id: string) => {
    persist({
      ...data,
      profiles: data.profiles.filter(p => p.id !== id),
      students: data.students.filter(s => s.user_id !== id),
    });
  }, [data, persist]);

  // ── Students ─────────────────────────────────────────────────────────────────
  const updateStudent = useCallback((userId: string, patch: Partial<Student>) => {
    persist({ ...data, students: data.students.map(s => s.user_id === userId ? { ...s, ...patch } : s) });
  }, [data, persist]);

  // ── Tasks ────────────────────────────────────────────────────────────────────
  const addTask = useCallback((task: Omit<Task, 'id' | 'created_at'>) => {
    persist({ ...data, tasks: [...data.tasks, { ...task, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const deleteTask = useCallback((id: string) => {
    persist({ ...data, tasks: data.tasks.filter(t => t.id !== id) });
  }, [data, persist]);

  // ── Submissions ──────────────────────────────────────────────────────────────
  const addSubmission = useCallback((sub: Omit<Submission, 'id'>) => {
    persist({ ...data, submissions: [...data.submissions, { ...sub, id: uid() }] });
  }, [data, persist]);

  const updateSubmissionStatus = useCallback((id: string, status: 'PENDING' | 'ACCEPTED' | 'RETURNED') => {
    persist({ ...data, submissions: data.submissions.map(s => s.id === id ? { ...s, status } : s) });
  }, [data, persist]);

  // ── Comments ─────────────────────────────────────────────────────────────────
  const addComment = useCallback((comment: Omit<Comment, 'id' | 'created_at'>) => {
    persist({ ...data, comments: [...data.comments, { ...comment, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  // ── Attendance ───────────────────────────────────────────────────────────────
  const addAttendance = useCallback((att: Omit<Attendance, 'id' | 'marked_at'>) => {
    persist({ ...data, attendance: [...data.attendance, { ...att, id: uid(), marked_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const toggleAttendance = useCallback((studentId: string, date: string, isPresent: boolean) => {
    let nextAttendance = [...data.attendance];
    if (isPresent) {
      const exists = nextAttendance.some(a => a.student_id === studentId && a.date === date);
      if (!exists) {
        nextAttendance.push({
          id: uid(),
          student_id: studentId,
          date,
          marked_at: new Date().toISOString().slice(0, 10)
        });
      }
    } else {
      nextAttendance = nextAttendance.filter(a => !(a.student_id === studentId && a.date === date));
    }
    persist({ ...data, attendance: nextAttendance });
  }, [data, persist]);

  const markAllAttendance = useCallback((date: string, studentIds: string[], isPresent: boolean) => {
    let nextAttendance = [...data.attendance];
    if (isPresent) {
      studentIds.forEach(studentId => {
        const exists = nextAttendance.some(a => a.student_id === studentId && a.date === date);
        if (!exists) {
          nextAttendance.push({
            id: uid(),
            student_id: studentId,
            date,
            marked_at: new Date().toISOString().slice(0, 10)
          });
        }
      });
    } else {
      nextAttendance = nextAttendance.filter(a => !(studentIds.includes(a.student_id) && a.date === date));
    }
    persist({ ...data, attendance: nextAttendance });
  }, [data, persist]);

  // ── Credits ─────────────────────────────────────────────────────────────────
  const addCredit = useCallback((credit: Omit<Credit, 'id' | 'assigned_at'>) => {
    persist({ ...data, credits: [...data.credits, { ...credit, id: uid(), assigned_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  return {
    ...data,
    addOJT,
    deleteOJT,
    addProject,
    addProjects,
    deleteProject,
    addMentor,
    addMentors,
    addStudentRecord,
    addStudentRecords,
    deleteProfile,
    updateStudent,
    addTask,
    deleteTask,
    addSubmission,
    updateSubmissionStatus,
    addComment,
    addAttendance,
    toggleAttendance,
    markAllAttendance,
    addCredit,
  };
}
