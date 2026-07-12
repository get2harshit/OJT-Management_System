import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type {
  Profile, Semester, Batch, Student, Task, Submission, Credit, Attendance, Comment,
  OJT, Project, CreditRequest
} from '../lib/types';

// OJT Form mentors default
const defaultProfiles: Profile[] = [
  { id: 'a1', email: 'admin@ojt.edu', name: 'Admin User', role: 'ADMIN', created_at: '2024-01-01' },
  { id: 'm1', email: 'vishal.donda@ojt.edu', name: 'Donda Vishal', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Data Scientist'], capacity: 5, is_available: true },
  { id: 'm2', email: 'rohit.gupta@ojt.edu', name: 'Rohit Gupta', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Product Development', 'Gen AI'], capacity: 5, is_available: true },
  { id: 'm3', email: 'khan.majeed@ojt.edu', name: 'Mohammed Majeed Khan', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development'], capacity: 5, is_available: true },
  { id: 'm4', email: 'batra.harshit@ojt.edu', name: 'Harshit Batra', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Product Development', 'Gen AI'], capacity: 5, is_available: true },
  { id: 'm6', email: 'dhooria.kshitiz@ojt.edu', name: 'Kshitiz Dhooria', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Product Development'], capacity: 5, is_available: true },
  { id: 'm7', email: 'patidar.narvin@ojt.edu', name: 'Narvin Patidar', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Open Source'], capacity: 5, is_available: true },
  { id: 'm8', email: 'kumar.divyashant@ojt.edu', name: 'Divyashant Kumar', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development', 'Product Development'], capacity: 5, is_available: true },
  { id: 'm9', email: 'das.subham@ojt.edu', name: 'Subham Das', role: 'MENTOR', created_at: '2024-01-01', track: 'Application Development', tracks: ['Application Development'], capacity: 5, is_available: true },
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
  { id: 'b1', name: '2024-2025', semester_id: 'sem1', created_at: '2024-09-01' },
  { id: 'b2', name: '2025-2026', semester_id: 'sem1', created_at: '2024-09-01' },
  { id: 'b3', name: '2026-2027', semester_id: 'sem2', created_at: '2025-01-15' },
];

const defaultStudents: Student[] = [
  { user_id: 's1', roll_number: 'OJT-2024-001', batch_id: 'b1', semester_id: 'sem1', track: 'Product Development', ojt_id: 'ojt1', project_id: 'p1', mentor_id: 'm1', viva1: 85, viva2: 78, viva3: null, ojt_marks: 72, internal_marks: 88, presentation_marks: 90, logbook_checked: true, project_video_url: 'https://youtube.com/watch?v=demo1', deployment_url: 'https://demo1.vercel.app', progress_status: 'ON_TRACK', preferred_mentors: ['m1', 'm2'] },
  { user_id: 's2', roll_number: 'OJT-2024-002', batch_id: 'b1', semester_id: 'sem1', track: 'Product Development', ojt_id: 'ojt1', project_id: 'p2', mentor_id: 'm1', viva1: 70, viva2: null, viva3: null, ojt_marks: null, internal_marks: null, presentation_marks: null, logbook_checked: false, progress_status: 'DELAYING' },
  { user_id: 's3', roll_number: 'OJT-2024-003', batch_id: 'b1', semester_id: 'sem1', track: 'Application Development', ojt_id: 'ojt1', project_id: 'p3', mentor_id: 'm2', viva1: 92, viva2: 88, viva3: 90, ojt_marks: 85, internal_marks: 91, presentation_marks: 94, logbook_checked: true, project_video_url: 'https://youtube.com/watch?v=demo3', deployment_url: 'https://demo3.vercel.app', progress_status: 'ON_TRACK' },
  { user_id: 's4', roll_number: 'OJT-2024-004', batch_id: 'b2', semester_id: 'sem1', track: 'Application Development', ojt_id: null, project_id: null, mentor_id: null, viva1: null, viva2: null, viva3: null, ojt_marks: null, progress_status: 'IN_PROCESS' },
  { user_id: 's5', roll_number: 'OJT-2024-005', batch_id: 'b2', semester_id: 'sem2', track: 'Data Scientist', ojt_id: null, project_id: null, mentor_id: 'm3', viva1: 60, viva2: 55, viva3: null, ojt_marks: null, progress_status: 'DELAYING' },
  { user_id: 's6', roll_number: 'OJT-2024-006', batch_id: 'b3', semester_id: 'sem2', track: 'Data Scientist', ojt_id: null, project_id: null, mentor_id: null, viva1: null, viva2: null, viva3: null, ojt_marks: null, progress_status: 'IN_PROCESS' },
];

const defaultOJTs: OJT[] = [
  { id: 'ojt1', name: 'OJT Program — Fall 2024', start_date: '2024-09-15', end_date: '2024-12-15', created_at: '2024-09-01' },
  { id: 'ojt2', name: 'OJT Program — Spring 2025', start_date: '2025-02-01', end_date: '2025-05-01', created_at: '2025-01-15' },
];

const defaultProjects: Project[] = [
  { id: 'p1', title: 'E-Commerce Marketplace', description: 'Design a full-featured e-commerce application with secure checkout and catalog management.', track: 'Product Development', created_at: '2024-09-05', end_goals: 'Working frontend, Stripe integration, deployment link', related_field: 'React, Node, Express, MongoDB' },
  { id: 'p2', title: 'Social Network App', description: 'Build a private social networking service with feeds, messaging, and profile setup.', track: 'Application Development', created_at: '2024-09-05', end_goals: 'Responsive mobile-friendly dashboard and messaging system', related_field: 'Flutter, Firebase, GraphQL' },
  { id: 'p3', title: 'Customer Churn Predictor', description: 'Create an ML model that predicts customer churn based on usage logs and demographic variables.', track: 'Data Scientist', created_at: '2024-09-05', end_goals: 'Jupyter notebook with models, confusion matrices, and model API', related_field: 'Python, Pandas, Scikit-learn, FastAPI' },
];

const defaultTasks: Task[] = [
  { id: 't1', title: 'Wireframe and PRD Submission', description: 'Draft the product requirements and draw low-fidelity user wireframes.', type: 'STUDENT_SPECIFIC', assigned_to: null, mentor_id: null, start_date: '2024-09-01', due_date: '2024-10-15', created_at: '2024-09-01', week_number: 1, sub_tasks: ['Draft PRD document', 'Draw initial mobile screens', 'Get peer feedback'], is_viva: false, track: 'Product Development' },
  { id: 't2', title: 'Database Design Schema', description: 'Formulate database entities, relations, and primary keys.', type: 'STUDENT_SPECIFIC', assigned_to: 's1', mentor_id: null, start_date: '2024-09-10', due_date: '2024-10-20', created_at: '2024-09-01', week_number: 2, sub_tasks: ['Create ERD schema diagram', 'Run migration scripts locally', 'Insert initial mock records'], is_viva: false, track: 'Product Development' },
  { id: 't3', title: 'Viva 1: Mid-Term Evaluation', description: 'Oral evaluation on foundational aspects and architecture design.', type: 'MENTOR_SPECIFIC', assigned_to: 'm1', mentor_id: 'm1', start_date: '2024-09-15', due_date: '2024-10-25', created_at: '2024-09-05', week_number: 4, sub_tasks: ['Review design drafts', 'Examine database performance constraints'], is_viva: true, track: 'Product Development' },
  { id: 't4', title: 'Feature API Development', description: 'Build and deploy RESTful end-points.', type: 'STUDENT_SPECIFIC', assigned_to: 's3', mentor_id: 'm2', start_date: '2024-09-20', due_date: '2024-10-30', created_at: '2024-09-05', week_number: 6, sub_tasks: ['Write unit tests for endpoints', 'Deploy staging API'], is_viva: false, track: 'Application Development' },
  { id: 't5', title: 'Log Book Submission', description: 'Submit log book for checking.', type: 'MENTOR_SPECIFIC', assigned_to: null, mentor_id: null, start_date: '2024-09-01', due_date: '2024-12-20', created_at: '2024-09-01', week_number: 12, sub_tasks: ['Check all weekly logs', 'Sign off logbook page'], is_viva: false, track: 'Product Development' },
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

const defaultCreditRequests: CreditRequest[] = [
  { id: 'cr1', student_id: 's1', provider: 'AWS', amount: 100, reason: 'Need AWS credits for hosting e-commerce prototype.', mentor_status: 'VOUCHED', admin_status: 'PENDING', created_at: '2024-09-20' },
  { id: 'cr2', student_id: 's2', provider: 'GCP', amount: 50, reason: 'Need Google App Engine hosting for assignment.', mentor_status: 'PENDING', admin_status: 'PENDING', created_at: '2024-09-21' },
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

export interface OJTBatchStudentRecord {
  name: string;
  email?: string;
  contact_no?: string;
  track: string;
  preferred_mentors?: string[];
  is_own_project?: boolean;
  project_title?: string;
  project_description?: string;
  tech_stack?: string;
}

const STORAGE_KEY = 'ojt-management-data';

interface StoredData {
  profiles: Profile[];
  semesters: Semester[];
  batches: Batch[];
  students: Student[];
  tasks: Task[];
  submissions: Submission[];
  credits: Credit[];
  creditRequests: CreditRequest[];
  attendance: Attendance[];
  comments: Comment[];
  ojts: OJT[];
  projects: Project[];
}

function loadData(): StoredData {
  const freshDefaults: StoredData = {
    profiles: defaultProfiles,
    semesters: defaultSemesters,
    batches: defaultBatches,
    students: defaultStudents,
    tasks: defaultTasks,
    submissions: defaultSubmissions,
    credits: defaultCredits,
    creditRequests: defaultCreditRequests,
    attendance: defaultAttendance,
    comments: defaultComments,
    ojts: defaultOJTs,
    projects: defaultProjects,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredData>;
      if (!parsed.creditRequests) parsed.creditRequests = defaultCreditRequests;

      const hasOldTracks = parsed.students?.some((s) =>
        s.track === 'Cloud Computing' || s.track === 'DevOps' || s.track === 'Full Stack'
      ) || parsed.projects?.some((p) =>
        p.track === 'Cloud Computing' || p.track === 'DevOps' || p.track === 'Full Stack'
      );

      const hasNitin = parsed.profiles?.some((p) => p.name === 'Nitin Singh');
      const hasJaya = parsed.profiles?.some((p) => p.name === 'Jayaprasad');
      const hasRohit = parsed.profiles?.some((p) => p.name === 'Rohit Gupta');
      const hasOldBatches = parsed.batches?.some((b) =>
        b.name === 'Batch A' || b.name === 'Batch B' || b.name === 'Batch C'
      );

      if (hasOldTracks || hasNitin || hasJaya || !hasRohit || hasOldBatches) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(freshDefaults));
        return freshDefaults;
      }
      return parsed as StoredData;
    }
  } catch { /* ignore */ }
  return freshDefaults;
}

function saveData(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

interface DataContextType extends StoredData {
  addOJT: (ojt: Omit<OJT, 'id' | 'created_at'>) => void;
  deleteOJT: (id: string) => void;
  addProject: (proj: Omit<Project, 'id' | 'created_at'>) => void;
  addProjects: (projs: Omit<Project, 'id' | 'created_at'>[]) => void;
  deleteProject: (id: string) => void;
  addMentor: (name: string, email: string, tracks: string[], capacity?: number, isAvailable?: boolean) => void;
  addMentors: (records: { name: string; email: string; tracks?: string[] }[]) => void;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
  importOJTBatch: (cohortId: string, studentRecords: OJTBatchStudentRecord[], batchName?: string, semesterName?: string) => void;
  addStudentRecord: (name: string, email: string, roll_number: string, batch_id: string, semester_id: string, track: string) => void;
  addStudentRecords: (records: { name: string; email: string; roll_number: string; batch_id: string | null; semester_id: string | null; track: string | null }[]) => void;
  deleteProfile: (id: string) => void;
  updateStudent: (userId: string, patch: Partial<Student>) => void;
  addTask: (task: Omit<Task, 'id' | 'created_at'>) => void;
  deleteTask: (id: string) => void;
  addSubmission: (sub: Omit<Submission, 'id'>) => void;
  updateSubmissionStatus: (id: string, status: 'PENDING' | 'ACCEPTED' | 'RETURNED') => void;
  addComment: (comment: Omit<Comment, 'id' | 'created_at'>) => void;
  addAttendance: (att: Omit<Attendance, 'id' | 'marked_at'>) => void;
  toggleAttendance: (studentId: string, date: string, isPresent: boolean) => void;
  markAllAttendance: (date: string, studentIds: string[], isPresent: boolean) => void;
  addCredit: (credit: Omit<Credit, 'id' | 'assigned_at'>) => void;
  addCreditRequest: (req: Omit<CreditRequest, 'id' | 'mentor_status' | 'admin_status' | 'created_at'>) => void;
  vouchCreditRequest: (id: string, status: 'VOUCHED' | 'REJECTED') => void;
  approveCreditRequest: (id: string, status: 'APPROVED' | 'REJECTED', code?: string) => void;
  addStudentChangeRequest: (studentId: string, type: 'MENTOR' | 'PROJECT', requestedId: string, reason: string) => void;
  resolveStudentChangeRequest: (studentId: string, status: 'APPROVED' | 'REJECTED') => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoredData>(loadData);

  const persist = useCallback((next: StoredData) => {
    setData(next);
    saveData(next);
  }, []);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const addOJT = useCallback((ojt: Omit<OJT, 'id' | 'created_at'>) => {
    const next = { ...data, ojts: [...data.ojts, { ...ojt, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] };
    persist(next);
  }, [data, persist]);

  const deleteOJT = useCallback((id: string) => {
    persist({ ...data, ojts: data.ojts.filter(o => o.id !== id) });
  }, [data, persist]);

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

  const addMentor = useCallback((name: string, email: string, tracks: string[], capacity = 5, isAvailable = true) => {
    const id = 'm' + uid();
    const profile: Profile = {
      id, name, email, role: 'MENTOR', created_at: new Date().toISOString().slice(0, 10),
      track: tracks[0] || 'Product Development', tracks, capacity, is_available: isAvailable
    };
    persist({ ...data, profiles: [...data.profiles, profile] });
  }, [data, persist]);

  const addMentors = useCallback((records: { name: string; email: string; tracks?: string[] }[]) => {
    const newProfiles = [...data.profiles];
    records.forEach(r => {
      const id = 'm' + uid();
      newProfiles.push({
        id, name: r.name, email: r.email, role: 'MENTOR', created_at: new Date().toISOString().slice(0, 10),
        track: r.tracks?.[0] || 'Product Development', tracks: r.tracks || ['Product Development'], capacity: 5, is_available: true
      });
    });
    persist({ ...data, profiles: newProfiles });
  }, [data, persist]);

  const updateProfile = useCallback((id: string, patch: Partial<Profile>) => {
    persist({
      ...data,
      profiles: data.profiles.map(p => p.id === id ? { ...p, ...patch } : p)
    });
  }, [data, persist]);

  const importOJTBatch = useCallback((cohortId: string, studentRecords: OJTBatchStudentRecord[], batchName?: string, semesterName?: string) => {
    const currentProfiles = [...data.profiles];
    const currentStudents = [...data.students];
    const currentProjects = [...data.projects];
    const currentBatches = [...data.batches];
    const currentSemesters = [...data.semesters];

    let semesterId: string | null = null;
    if (semesterName) {
      const existingSem = currentSemesters.find(s => s.name.toLowerCase() === semesterName.toLowerCase());
      if (existingSem) {
        semesterId = existingSem.id;
      } else {
        semesterId = 'sem_' + uid();
        currentSemesters.push({
          id: semesterId, name: semesterName, start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10), is_active: false, created_at: new Date().toISOString().slice(0, 10)
        });
      }
    } else {
      semesterId = cohortId === 'ojt1' ? 'sem1' : cohortId === 'ojt2' ? 'sem2' : 'sem1';
    }

    let batchId: string | null = null;
    if (batchName && semesterId) {
      const existingBatch = currentBatches.find(b => b.name.toLowerCase() === batchName.toLowerCase() && b.semester_id === semesterId);
      if (existingBatch) {
        batchId = existingBatch.id;
      } else {
        batchId = 'b_' + uid();
        currentBatches.push({
          id: batchId, name: batchName, semester_id: semesterId, created_at: new Date().toISOString().slice(0, 10)
        });
      }
    } else {
      batchId = cohortId === 'ojt1' ? 'b1' : cohortId === 'ojt2' ? 'b2' : 'b1';
    }

    studentRecords.forEach(record => {
      const studentId = 's' + uid();
      currentProfiles.push({
        id: studentId, email: record.email || `${record.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@ojt.edu`,
        name: record.name, role: 'STUDENT', created_at: new Date().toISOString().slice(0, 10)
      });

      let projectId: string | null = null;
      if (record.is_own_project) {
        const newProjId = 'p' + uid();
        currentProjects.push({
          id: newProjId, title: record.project_title || `Own Project - ${record.name}`,
          description: record.project_description || '', track: record.track, created_at: new Date().toISOString().slice(0, 10),
          related_field: record.tech_stack || '', source: 'Own'
        });
        projectId = newProjId;
      }

      const randNum = Math.floor(100 + Math.random() * 900);
      const rollNumber = `OJT-2024-${randNum}`;

      currentStudents.push({
        user_id: studentId, roll_number: rollNumber, batch_id: batchId, semester_id: semesterId,
        track: record.track, ojt_id: cohortId, project_id: projectId, mentor_id: null,
        preferred_mentors: record.preferred_mentors || [], contact_no: record.contact_no || '',
        tech_stack: record.tech_stack || '', viva1: null, viva2: null, viva3: null, ojt_marks: null,
        progress_status: 'IN_PROCESS'
      });
    });

    persist({
      ...data,
      profiles: currentProfiles, students: currentStudents, projects: currentProjects,
      batches: currentBatches, semesters: currentSemesters
    });
  }, [data, persist]);

  const addStudentRecord = useCallback((name: string, email: string, roll_number: string, batch_id: string, semester_id: string, track: string) => {
    const id = 's' + uid();
    const profile: Profile = { id, name, email, role: 'STUDENT', created_at: new Date().toISOString().slice(0, 10) };
    const student: Student = {
      user_id: id, roll_number, batch_id: batch_id || null, semester_id: semester_id || null,
      track: track || null, ojt_id: null, project_id: null, mentor_id: null,
      viva1: null, viva2: null, viva3: null, ojt_marks: null, progress_status: 'IN_PROCESS'
    };
    persist({ ...data, profiles: [...data.profiles, profile], students: [...data.students, student] });
  }, [data, persist]);

  const addStudentRecords = useCallback((records: { name: string; email: string; roll_number: string; batch_id: string | null; semester_id: string | null; track: string | null }[]) => {
    const newProfiles = [...data.profiles];
    const newStudents = [...data.students];

    records.forEach(r => {
      const id = 's' + uid();
      newProfiles.push({ id, name: r.name, email: r.email, role: 'STUDENT', created_at: new Date().toISOString().slice(0, 10) });
      newStudents.push({
        user_id: id, roll_number: r.roll_number, batch_id: r.batch_id, semester_id: r.semester_id,
        track: r.track, ojt_id: null, project_id: null, mentor_id: null,
        viva1: null, viva2: null, viva3: null, ojt_marks: null, progress_status: 'IN_PROCESS'
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

  const updateStudent = useCallback((userId: string, patch: Partial<Student>) => {
    persist({ ...data, students: data.students.map(s => s.user_id === userId ? { ...s, ...patch } : s) });
  }, [data, persist]);

  const addTask = useCallback((task: Omit<Task, 'id' | 'created_at'>) => {
    persist({ ...data, tasks: [...data.tasks, { ...task, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const deleteTask = useCallback((id: string) => {
    persist({ ...data, tasks: data.tasks.filter(t => t.id !== id) });
  }, [data, persist]);

  const addSubmission = useCallback((sub: Omit<Submission, 'id'>) => {
    persist({ ...data, submissions: [...data.submissions, { ...sub, id: uid() }] });
  }, [data, persist]);

  const updateSubmissionStatus = useCallback((id: string, status: 'PENDING' | 'ACCEPTED' | 'RETURNED') => {
    persist({ ...data, submissions: data.submissions.map(s => s.id === id ? { ...s, status } : s) });
  }, [data, persist]);

  const addComment = useCallback((comment: Omit<Comment, 'id' | 'created_at'>) => {
    persist({ ...data, comments: [...data.comments, { ...comment, id: uid(), created_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const addAttendance = useCallback((att: Omit<Attendance, 'id' | 'marked_at'>) => {
    persist({ ...data, attendance: [...data.attendance, { ...att, id: uid(), marked_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const toggleAttendance = useCallback((studentId: string, date: string, isPresent: boolean) => {
    let nextAttendance = [...data.attendance];
    if (isPresent) {
      const exists = nextAttendance.some(a => a.student_id === studentId && a.date === date);
      if (!exists) {
        nextAttendance.push({
          id: uid(), student_id: studentId, date, marked_at: new Date().toISOString().slice(0, 10)
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
            id: uid(), student_id: studentId, date, marked_at: new Date().toISOString().slice(0, 10)
          });
        }
      });
    } else {
      nextAttendance = nextAttendance.filter(a => !(studentIds.includes(a.student_id) && a.date === date));
    }
    persist({ ...data, attendance: nextAttendance });
  }, [data, persist]);

  const addCredit = useCallback((credit: Omit<Credit, 'id' | 'assigned_at'>) => {
    persist({ ...data, credits: [...data.credits, { ...credit, id: uid(), assigned_at: new Date().toISOString().slice(0, 10) }] });
  }, [data, persist]);

  const addCreditRequest = useCallback((req: Omit<CreditRequest, 'id' | 'mentor_status' | 'admin_status' | 'created_at'>) => {
    const newReq: CreditRequest = {
      ...req, id: 'cr' + uid(), mentor_status: 'PENDING', admin_status: 'PENDING',
      created_at: new Date().toISOString().slice(0, 10),
    };
    persist({ ...data, creditRequests: [...data.creditRequests, newReq] });
  }, [data, persist]);

  const vouchCreditRequest = useCallback((id: string, status: 'VOUCHED' | 'REJECTED') => {
    persist({
      ...data, creditRequests: data.creditRequests.map(r => r.id === id ? { ...r, mentor_status: status } : r)
    });
  }, [data, persist]);

  const approveCreditRequest = useCallback((id: string, status: 'APPROVED' | 'REJECTED', code?: string) => {
    const target = data.creditRequests.find(r => r.id === id);
    if (!target) return;

    const updatedCredits = [...data.credits];
    if (status === 'APPROVED' && code) {
      updatedCredits.push({
        id: 'c' + uid(), student_id: target.student_id, provider: target.provider,
        amount: target.amount, code: code,
        expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        assigned_at: new Date().toISOString().slice(0, 10),
      });
    }

    persist({
      ...data, credits: updatedCredits,
      creditRequests: data.creditRequests.map(r => r.id === id ? { ...r, admin_status: status, code } : r)
    });
  }, [data, persist]);

  const addStudentChangeRequest = useCallback((studentId: string, type: 'MENTOR' | 'PROJECT', requestedId: string, reason: string) => {
    const student = data.students.find(s => s.user_id === studentId);
    const currentCount = student?.change_request?.count || 0;

    const updatedStudents = data.students.map(s => {
      if (s.user_id === studentId) {
        return {
          ...s,
          change_request: {
            type, requestedId, reason, status: 'PENDING' as const, count: currentCount + 1
          }
        };
      }
      return s;
    });

    persist({ ...data, students: updatedStudents });
  }, [data, persist]);

  const resolveStudentChangeRequest = useCallback((studentId: string, status: 'APPROVED' | 'REJECTED') => {
    const student = data.students.find(s => s.user_id === studentId);
    if (!student || !student.change_request) return;

    const { type, requestedId } = student.change_request;

    const updatedStudents = data.students.map(s => {
      if (s.user_id === studentId) {
        const patch: Partial<Student> = {
          change_request: { ...s.change_request!, status }
        };
        if (status === 'APPROVED') {
          if (type === 'MENTOR') patch.mentor_id = requestedId;
          if (type === 'PROJECT') patch.project_id = requestedId;
        }
        return { ...s, ...patch };
      }
      return s;
    });

    persist({ ...data, students: updatedStudents });
  }, [data, persist]);

  // Memoized so a re-render of DataProvider that isn't caused by `data`
  // changing (e.g. a parent provider above it re-rendering, now that this
  // sits at the App root) doesn't hand every useData() consumer a new
  // object identity and force them all to re-render for nothing.
  const contextValue: DataContextType = useMemo(() => ({
    ...data,
    addOJT,
    deleteOJT,
    addProject,
    addProjects,
    deleteProject,
    addMentor,
    addMentors,
    updateProfile,
    importOJTBatch,
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
    addCreditRequest,
    vouchCreditRequest,
    approveCreditRequest,
    addStudentChangeRequest,
    resolveStudentChangeRequest,
  }), [
    data,
    addOJT,
    deleteOJT,
    addProject,
    addProjects,
    deleteProject,
    addMentor,
    addMentors,
    updateProfile,
    importOJTBatch,
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
    addCreditRequest,
    vouchCreditRequest,
    approveCreditRequest,
    addStudentChangeRequest,
    resolveStudentChangeRequest,
  ]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
