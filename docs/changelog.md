# 📝 Changelog

> Track all changes, features, and bug fixes over time.
> Format: `[YYYY-MM-DD] — Category — Description`

---

## 2026-06-29

### ✨ Improvements
- **OJT Duration Display**: Replaced raw date-range text (`YYYY-MM-DD → YYYY-MM-DD`) with human-readable duration format (e.g., "3 Months", "3 Months, 14 Days") in the Admin OJT Programs table and Mentor OJT assignment modal.
- **Utility Function**: Added `getDurationString()` in `src/lib/utils.ts` for calculating calendar differences between dates.

### 📘 Documentation
- **Created `/docs/` directory** with comprehensive project documentation:
  - `README.md` — Documentation hub index
  - `architecture.md` — Tech stack, directory structure, routing, data flow
  - `database-schema.md` — All tables, enums, relationships, indexes, RLS, ER diagram
  - `features.md` — Complete feature inventory with status tracking (70+ features)
  - `components.md` — Shared component API reference (DataTable, Modal, Sidebar, StatCard)
  - `data-layer.md` — useMockData hook reference, all mutations, Supabase migration plan
  - `api-endpoints.md` — All data operations mapped with Supabase equivalents
  - `changelog.md` — This file

---

## 2026-06-26

### 🚀 Initial Build
- **Project scaffolding**: Vite + React + TypeScript + Tailwind CSS
- **Three role-based panels**: Admin, Mentor, Student
- **Landing page**: Panel selection with gold/dark theme
- **Shared components**: DataTable, Modal, Sidebar, StatCard
- **Mock data layer**: `useMockData` hook with localStorage persistence
- **Admin panel**: Dashboard, Students, Mentors, OJTs, Tasks, Submissions, Credits, Attendance, Evaluation Tracker
- **Mentor panel**: Dashboard, Students (read-only), OJTs & Projects, Tasks, Submissions, Attendance, Evaluation Tracker
- **Student panel**: Dashboard, Project Picker, Tasks, Submissions, Credits, Attendance
- **Database schema**: Supabase migration with 10 tables, 3 enums, 7 indexes, RLS policies
- **Supabase client**: Initialized (not yet wired to UI)

---

<!-- 
Template for new entries:

## YYYY-MM-DD

### ✨ Features
- 

### 🐛 Bug Fixes
- 

### ✨ Improvements
- 

### 📘 Documentation
- 

### 🔧 Refactoring
- 

### ⚠️ Breaking Changes
- 
-->
