# ✅ Feature Inventory

> Track all features across Admin, Mentor, and Student panels.
> Update the **Status** column as features progress.

**Status Legend**:
- ✅ **Done** — Feature is fully implemented and functional
- 🟡 **Mock** — Works with mock/localStorage data, not wired to Supabase yet
- 🔲 **Planned** — Not yet implemented
- 🚧 **In Progress** — Currently being worked on

---

## 🔐 Authentication & Authorization

| # | Feature | Status | Notes |
|---|---|---|---|
| A-01 | Supabase Auth (email/password login) | 🔲 Planned | Supabase client initialized but not wired |
| A-02 | Role-based panel access (Admin/Mentor/Student) | 🟡 Mock | Manual panel selection on landing page |
| A-03 | Session persistence | 🔲 Planned | — |
| A-04 | Protected routes / role guards | 🔲 Planned | No React Router yet |

---

## 🛡️ Admin Panel

### Dashboard
| # | Feature | Status | Notes |
|---|---|---|---|
| AD-01 | Overview stat cards (students, mentors, tasks, submissions, credits, attendance) | ✅ Done | — |
| AD-02 | Submission status breakdown (progress bar) | ✅ Done | Accepted/Pending/Returned |
| AD-03 | Filter by semester | ✅ Done | — |
| AD-04 | Filter by batch | ✅ Done | Cascades from semester |
| AD-05 | Filter by track | ✅ Done | — |

### Student Management
| # | Feature | Status | Notes |
|---|---|---|---|
| AS-01 | Student list with DataTable (search, pagination) | ✅ Done | — |
| AS-02 | Add single student (modal form) | ✅ Done | Name, email, roll number, batch, semester, track |
| AS-03 | Bulk import students via CSV | ✅ Done | Paste or file upload |
| AS-04 | Delete student | ✅ Done | Removes profile + student record |
| AS-05 | Edit student fields (batch, semester, track) | ✅ Done | Inline via update |

### Mentor Management
| # | Feature | Status | Notes |
|---|---|---|---|
| AM-01 | Mentor list with DataTable | ✅ Done | — |
| AM-02 | Add single mentor (modal form) | ✅ Done | Name, email |
| AM-03 | Bulk import mentors via CSV | ✅ Done | Paste or file upload |
| AM-04 | Delete mentor | ✅ Done | — |

### OJT Programs
| # | Feature | Status | Notes |
|---|---|---|---|
| AO-01 | OJT list with DataTable | ✅ Done | — |
| AO-02 | Create OJT (name, start date, end date) | ✅ Done | — |
| AO-03 | Delete OJT | ✅ Done | — |
| AO-04 | Duration display (human-readable) | ✅ Done | e.g., "3 Months" |

### Task Management
| # | Feature | Status | Notes |
|---|---|---|---|
| AT-01 | Task list with DataTable | ✅ Done | — |
| AT-02 | Create task (title, description, type, assigned_to, start/due date) | ✅ Done | — |
| AT-03 | Delete task | ✅ Done | — |
| AT-04 | Task type: STUDENT_SPECIFIC / MENTOR_SPECIFIC | ✅ Done | — |

### Submissions
| # | Feature | Status | Notes |
|---|---|---|---|
| ASb-01 | Submission list with DataTable | ✅ Done | — |
| ASb-02 | Filter by type (Student/Mentor) | ✅ Done | — |
| ASb-03 | Filter by category (PRD/VIDEO/COMMON_TASK/SPECIFIC_TASK) | ✅ Done | — |
| ASb-04 | View submission details (detail panel) | ✅ Done | Shows file, status, version |
| ASb-05 | Accept / Return submission | ✅ Done | Updates status |
| ASb-06 | Add comments on submissions | ✅ Done | Threaded comments |

### Cloud Credits
| # | Feature | Status | Notes |
|---|---|---|---|
| AC-01 | Credit list with DataTable | ✅ Done | — |
| AC-02 | Assign credit (student, provider, amount, code, expiry) | ✅ Done | — |

### Attendance
| # | Feature | Status | Notes |
|---|---|---|---|
| AA-01 | Attendance grid (date × students) | ✅ Done | — |
| AA-02 | Toggle individual attendance | ✅ Done | — |
| AA-03 | Mark all present/absent for a date | ✅ Done | — |
| AA-04 | Date picker | ✅ Done | — |

### Evaluation Tracker
| # | Feature | Status | Notes |
|---|---|---|---|
| AE-01 | Student evaluation table (Viva 1/2/3, OJT Marks, Attendance %, Total) | ✅ Done | — |
| AE-02 | Edit viva / OJT marks (modal) | ✅ Done | — |
| AE-03 | Attendance percentage calculation | ✅ Done | Based on unique attendance dates |

---

## 👨‍🏫 Mentor Panel

### Dashboard
| # | Feature | Status | Notes |
|---|---|---|---|
| MD-01 | Overview stat cards (tasks, submissions, students) | ✅ Done | — |
| MD-02 | Submission status breakdown | ✅ Done | — |
| MD-03 | Filter by semester / batch / track | ✅ Done | — |

### Students
| # | Feature | Status | Notes |
|---|---|---|---|
| MS-01 | Read-only student list | ✅ Done | No CRUD, view only |

### OJTs & Projects
| # | Feature | Status | Notes |
|---|---|---|---|
| MO-01 | Project list with DataTable | ✅ Done | — |
| MO-02 | Upload projects via CSV (paste or file) | ✅ Done | title, description, track |
| MO-03 | Delete project | ✅ Done | Un-assigns from students |
| MO-04 | Student assignment table | ✅ Done | Shows OJT/project assignment status |
| MO-05 | Assign OJT + Project to student (modal) | ✅ Done | — |
| MO-06 | Duration preview in assignment modal | ✅ Done | Human-readable format |

### Tasks
| # | Feature | Status | Notes |
|---|---|---|---|
| MT-01 | Task list with DataTable | ✅ Done | — |
| MT-02 | Create task | ✅ Done | — |
| MT-03 | Delete task | ✅ Done | — |

### Submissions
| # | Feature | Status | Notes |
|---|---|---|---|
| MSb-01 | Submission list with DataTable | ✅ Done | — |
| MSb-02 | Filter by category | ✅ Done | — |
| MSb-03 | View submission details | ✅ Done | — |
| MSb-04 | Accept / Return submission | ✅ Done | — |
| MSb-05 | Add comments | ✅ Done | — |

### Attendance
| # | Feature | Status | Notes |
|---|---|---|---|
| MA-01 | Attendance grid (same as Admin) | ✅ Done | — |
| MA-02 | Toggle / Mark all | ✅ Done | — |

### Evaluation Tracker
| # | Feature | Status | Notes |
|---|---|---|---|
| ME-01 | Evaluation table (same as Admin) | ✅ Done | — |
| ME-02 | Edit marks | ✅ Done | — |

---

## 🎓 Student Panel

### Dashboard
| # | Feature | Status | Notes |
|---|---|---|---|
| SD-01 | Overview stat cards (tasks, submissions, credits, attendance) | ✅ Done | — |
| SD-02 | Progress indicators | ✅ Done | — |

### Project Picker
| # | Feature | Status | Notes |
|---|---|---|---|
| SP-01 | Browse available projects (card layout) | ✅ Done | Filtered by track |
| SP-02 | Select / lock project | ✅ Done | Updates student record |
| SP-03 | Already-selected state display | ✅ Done | — |

### Tasks
| # | Feature | Status | Notes |
|---|---|---|---|
| ST-01 | Task list | ✅ Done | Shows assigned tasks |
| ST-02 | Task progress bar (completed/in-progress/missed) | ✅ Done | Color-coded bar |
| ST-03 | Quick-link to view submission | ✅ Done | Navigates to Submissions tab |
| ST-04 | Quick-link to create new submission | ✅ Done | Opens submission form |

### Submissions
| # | Feature | Status | Notes |
|---|---|---|---|
| SS-01 | Submission list (student's own) | ✅ Done | — |
| SS-02 | Submit new deliverable (file upload form) | ✅ Done | Category, task, file name |
| SS-03 | Versioned submissions | ✅ Done | Auto-increments version |
| SS-04 | View submission details | ✅ Done | — |
| SS-05 | Add comments on own submissions | ✅ Done | — |
| SS-06 | Deep-link from Tasks page | ✅ Done | via `initialSelectedSubId` / `initialNewSubTaskId` |

### Cloud Credits
| # | Feature | Status | Notes |
|---|---|---|---|
| SC-01 | View assigned credits | ✅ Done | Read-only |

### Attendance
| # | Feature | Status | Notes |
|---|---|---|---|
| SA-01 | View own attendance records | ✅ Done | Read-only |

---

## 🔮 Planned / Future Features

| # | Feature | Priority | Notes |
|---|---|---|---|
| F-01 | Supabase Auth integration | 🔴 High | Replace manual panel selection |
| F-02 | Wire all CRUD to Supabase (replace useMockData) | 🔴 High | Schema ready, client initialized |
| F-03 | URL-based routing (React Router) | 🟠 Medium | Enable deep linking, back/forward |
| F-04 | QR-based attendance | 🟠 Medium | Mentioned in README, not implemented |
| F-05 | File upload to Supabase Storage | 🟠 Medium | Currently mock file URLs |
| F-06 | Student-Mentor assignment (many-to-many) | 🟠 Medium | DB table exists, UI not built |
| F-07 | Notifications / Alerts | 🟢 Low | — |
| F-08 | Export reports (PDF/CSV) | 🟢 Low | — |
| F-09 | Dark/Light theme toggle | 🟢 Low | Currently dark only |
| F-10 | Mobile responsive optimization | 🟢 Low | — |
