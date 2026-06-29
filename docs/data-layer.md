# 💾 Data Layer

> How data flows through the application — from mock storage to future Supabase integration.

---

## Current: `useMockData` Hook

**File**: [`src/hooks/useMockData.ts`](../src/hooks/useMockData.ts)

The entire application's state is managed through a single custom React hook. It uses `localStorage` for persistence and React `useState` for reactivity.

### Architecture

```
localStorage ("ojt-management-data")
    │
    ▼
useMockData() hook
    ├── useState<StoredData>(loadData)    ← reads on mount
    ├── persist(next)                     ← writes on every mutation
    └── returns { ...data, ...mutations }
         │
         ▼
Panel index.tsx
    └── Passes data + mutations as props → Page components
```

### Stored Data Shape

```ts
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
```

**Storage Key**: `"ojt-management-data"`

### Default Mock Data

On first load (or if localStorage is empty/corrupted), the hook initializes with default data:

| Entity | Count | Sample |
|---|---|---|
| Profiles | 10 | 1 admin, 3 mentors, 6 students |
| Semesters | 2 | Fall 2024, Spring 2025 |
| Batches | 3 | Batch A, B, C |
| Students | 6 | OJT-2024-001 through OJT-2024-006 |
| OJTs | 2 | Fall 2024, Spring 2025 programs |
| Projects | 3 | AWS, GCP, CI/CD projects |
| Tasks | 5 | Cloud fundamentals, EC2, VPC, S3, Weekly Report |
| Submissions | 7 | Mix of PENDING, ACCEPTED, RETURNED |
| Credits | 4 | AWS, GCP, Vultr credits |
| Attendance | 10 | Sample records for Sep 2024 |
| Comments | 3 | Mentor feedback + student reply |

### ID Generation

```ts
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
```

IDs are prefixed by entity type in some cases:
- Mentor profiles: `'m' + uid()`
- Student profiles: `'s' + uid()`
- All others: `uid()`

---

## Mutation Functions

All mutations follow the same pattern: create a new `StoredData` object → call `persist()` which updates both React state and localStorage.

### OJT Operations
| Function | Signature | Description |
|---|---|---|
| `addOJT` | `(ojt: Omit<OJT, 'id' \| 'created_at'>) => void` | Create new OJT program |
| `deleteOJT` | `(id: string) => void` | Delete OJT by ID |

### Project Operations
| Function | Signature | Description |
|---|---|---|
| `addProject` | `(proj: Omit<Project, 'id' \| 'created_at'>) => void` | Create single project |
| `addProjects` | `(projs: Omit<Project, 'id' \| 'created_at'>[]) => void` | Bulk import projects |
| `deleteProject` | `(id: string) => void` | Delete project + unassign from students |

### Profile Operations
| Function | Signature | Description |
|---|---|---|
| `addMentor` | `(name: string, email: string) => void` | Create mentor profile |
| `addMentors` | `(records: {name, email}[]) => void` | Bulk import mentors |
| `addStudentRecord` | `(name, email, roll_number, batch_id, semester_id, track) => void` | Create student (profile + student record) |
| `addStudentRecords` | `(records[]) => void` | Bulk import students |
| `deleteProfile` | `(id: string) => void` | Delete profile + related student record |

### Student Operations
| Function | Signature | Description |
|---|---|---|
| `updateStudent` | `(userId: string, patch: Partial<Student>) => void` | Partial update student fields |

### Task Operations
| Function | Signature | Description |
|---|---|---|
| `addTask` | `(task: Omit<Task, 'id' \| 'created_at'>) => void` | Create task |
| `deleteTask` | `(id: string) => void` | Delete task |

### Submission Operations
| Function | Signature | Description |
|---|---|---|
| `addSubmission` | `(sub: Omit<Submission, 'id'>) => void` | Create submission |
| `updateSubmissionStatus` | `(id: string, status: SubmissionStatus) => void` | Accept/Return submission |

### Comment Operations
| Function | Signature | Description |
|---|---|---|
| `addComment` | `(comment: Omit<Comment, 'id' \| 'created_at'>) => void` | Add comment to submission |

### Attendance Operations
| Function | Signature | Description |
|---|---|---|
| `addAttendance` | `(att: Omit<Attendance, 'id' \| 'marked_at'>) => void` | Mark attendance |
| `toggleAttendance` | `(studentId, date, isPresent) => void` | Toggle single record |
| `markAllAttendance` | `(date, studentIds[], isPresent) => void` | Bulk toggle for a date |

### Credit Operations
| Function | Signature | Description |
|---|---|---|
| `addCredit` | `(credit: Omit<Credit, 'id' \| 'assigned_at'>) => void` | Assign cloud credit |

---

## Planned: Supabase Integration

**Client File**: [`src/lib/supabase.ts`](../src/lib/supabase.ts)

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### Environment Variables Required

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Migration Path

1. Replace each `useMockData` mutation with a Supabase query
2. Replace React `useState` with Supabase realtime subscriptions or `useEffect` + fetch
3. Add error handling and loading states
4. Remove localStorage persistence

---

## Utility Functions

**File**: [`src/lib/utils.ts`](../src/lib/utils.ts)

| Function | Signature | Description |
|---|---|---|
| `getDurationString` | `(startDate: string, endDate: string) => string` | Calculates human-readable duration between two dates. Returns e.g., "3 Months", "1 Month, 15 Days" |
