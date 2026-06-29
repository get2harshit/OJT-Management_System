# 🔌 API Endpoints / Data Operations

> This document maps every data operation in the app. Currently all operations go through the `useMockData` hook (localStorage). The **Supabase Equivalent** column shows the query to use when migrating.

---

## Operation Status Legend

- 🟡 **Mock** — Using localStorage via `useMockData`
- ✅ **Supabase** — Wired to Supabase
- 🔲 **Planned** — Not yet implemented

---

## Profiles

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List all profiles | `data.profiles` (read) | 🟡 Mock | `supabase.from('profiles').select('*')` |
| Create mentor | `addMentor(name, email)` | 🟡 Mock | `supabase.from('profiles').insert({ name, email, role: 'MENTOR' })` |
| Bulk create mentors | `addMentors(records[])` | 🟡 Mock | `supabase.from('profiles').insert(records)` |
| Create student (profile + record) | `addStudentRecord(...)` | 🟡 Mock | Transaction: insert into `profiles` + `students` |
| Bulk create students | `addStudentRecords(records[])` | 🟡 Mock | Transaction: bulk insert |
| Delete profile | `deleteProfile(id)` | 🟡 Mock | `supabase.from('profiles').delete().eq('id', id)` (cascades) |

---

## Students

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List students | `data.students` (read) | 🟡 Mock | `supabase.from('students').select('*, profiles(*)')` |
| Update student | `updateStudent(userId, patch)` | 🟡 Mock | `supabase.from('students').update(patch).eq('user_id', userId)` |

---

## Semesters

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List semesters | `data.semesters` (read) | 🟡 Mock | `supabase.from('semesters').select('*')` |
| Create semester | — | 🔲 Planned | `supabase.from('semesters').insert(...)` |
| Update semester | — | 🔲 Planned | `supabase.from('semesters').update(...)` |
| Delete semester | — | 🔲 Planned | `supabase.from('semesters').delete()` |

---

## Batches

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List batches | `data.batches` (read) | 🟡 Mock | `supabase.from('batches').select('*')` |
| Create batch | — | 🔲 Planned | `supabase.from('batches').insert(...)` |
| Delete batch | — | 🔲 Planned | `supabase.from('batches').delete()` |

---

## OJTs

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List OJTs | `data.ojts` (read) | 🟡 Mock | `supabase.from('ojts').select('*')` |
| Create OJT | `addOJT({ name, start_date, end_date })` | 🟡 Mock | `supabase.from('ojts').insert(...)` |
| Delete OJT | `deleteOJT(id)` | 🟡 Mock | `supabase.from('ojts').delete().eq('id', id)` |

> ⚠️ **Note**: The `ojts` table does not exist in the DB migration yet. Needs a new migration.

---

## Projects

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List projects | `data.projects` (read) | 🟡 Mock | `supabase.from('projects').select('*')` |
| Create project | `addProject({ title, description, track })` | 🟡 Mock | `supabase.from('projects').insert(...)` |
| Bulk create projects | `addProjects(projs[])` | 🟡 Mock | `supabase.from('projects').insert(projs)` |
| Delete project | `deleteProject(id)` | 🟡 Mock | `supabase.from('projects').delete().eq('id', id)` |

> ⚠️ **Note**: The `projects` table does not exist in the DB migration yet. Needs a new migration.

---

## Tasks

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List tasks | `data.tasks` (read) | 🟡 Mock | `supabase.from('tasks').select('*')` |
| Create task | `addTask({ title, description, type, assigned_to, mentor_id, start_date, due_date })` | 🟡 Mock | `supabase.from('tasks').insert(...)` |
| Delete task | `deleteTask(id)` | 🟡 Mock | `supabase.from('tasks').delete().eq('id', id)` |

---

## Submissions

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List submissions | `data.submissions` (read) | 🟡 Mock | `supabase.from('submissions').select('*, tasks(*)')` |
| Create submission | `addSubmission({ task_id, student_id, version, file_url, file_name, status, category, submitted_at })` | 🟡 Mock | `supabase.from('submissions').insert(...)` + Storage upload |
| Update status | `updateSubmissionStatus(id, status)` | 🟡 Mock | `supabase.from('submissions').update({ status }).eq('id', id)` |

---

## Comments

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List comments | `data.comments` (read) | 🟡 Mock | `supabase.from('submission_comments').select('*, profiles(*)')` |
| Create comment | `addComment({ submission_id, author_id, content })` | 🟡 Mock | `supabase.from('submission_comments').insert(...)` |

---

## Credits

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List credits | `data.credits` (read) | 🟡 Mock | `supabase.from('credits').select('*')` |
| Create credit | `addCredit({ student_id, provider, amount, code, expiry_date })` | 🟡 Mock | `supabase.from('credits').insert(...)` |

---

## Attendance

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| List attendance | `data.attendance` (read) | 🟡 Mock | `supabase.from('attendance').select('*')` |
| Create attendance | `addAttendance({ student_id, date })` | 🟡 Mock | `supabase.from('attendance').insert(...)` |
| Toggle attendance | `toggleAttendance(studentId, date, isPresent)` | 🟡 Mock | Insert or delete from `attendance` |
| Bulk toggle | `markAllAttendance(date, studentIds[], isPresent)` | 🟡 Mock | Batch insert/delete |

---

## Student-Mentor Mapping

| Operation | Mock Function | Status | Supabase Equivalent |
|---|---|---|---|
| Assign mentor | — | 🔲 Planned | `supabase.from('student_mentors').insert({ student_id, mentor_id })` |
| Remove mentor | — | 🔲 Planned | `supabase.from('student_mentors').delete()` |
| List mentors for student | — | 🔲 Planned | `supabase.from('student_mentors').select('*, profiles(*)').eq('student_id', id)` |

---

## Authentication

| Operation | Status | Supabase Equivalent |
|---|---|---|
| Sign up | 🔲 Planned | `supabase.auth.signUp({ email, password })` |
| Sign in | 🔲 Planned | `supabase.auth.signInWithPassword({ email, password })` |
| Sign out | 🔲 Planned | `supabase.auth.signOut()` |
| Get session | 🔲 Planned | `supabase.auth.getSession()` |
| Get user | 🔲 Planned | `supabase.auth.getUser()` |
