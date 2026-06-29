# 🏗️ Architecture

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | React (SPA) | ^18.3.1 |
| **Build Tool** | Vite | ^5.4.2 |
| **Language** | TypeScript | ^5.5.3 |
| **Styling** | Tailwind CSS | ^3.4.1 |
| **Icons** | Lucide React | ^0.344.0 |
| **Backend (planned)** | Supabase (PostgreSQL + Auth + Storage) | ^2.57.4 |
| **Font** | Montserrat (via Google Fonts) | — |

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `gold` | `#ffcc3f` | Primary accent, buttons, active states |
| `gold-hover` | `#e6b636` | Hover state for gold elements |
| `gold-dark` | `#c99a2a` | Dark gold variant |
| `zinc-850` | `#18181b` | Card backgrounds, main surface |
| `zinc-750` | `#27272a` | Borders, secondary surface, sidebar |
| `bg-black` | `#000000` | Page background |

---

## Directory Structure

```
OJT-Management-System/
├── docs/                          # 📘 Project documentation (this directory)
├── supabase/
│   └── migrations/
│       └── 20260626…_schema.sql   # Full database schema
├── src/
│   ├── App.tsx                    # Root — landing page + panel router
│   ├── main.tsx                   # ReactDOM entry point
│   ├── index.css                  # Global CSS + Tailwind directives
│   ├── vite-env.d.ts              # Vite type declarations
│   ├── components/                # Shared UI components
│   │   ├── DataTable.tsx          # Generic searchable, paginated table
│   │   ├── Modal.tsx              # Overlay modal dialog
│   │   ├── Sidebar.tsx            # Collapsible sidebar navigation
│   │   └── StatCard.tsx           # Dashboard statistics card
│   ├── hooks/
│   │   └── useMockData.ts         # Central data store (localStorage + React state)
│   ├── lib/
│   │   ├── types.ts               # TypeScript type definitions (all entities)
│   │   ├── supabase.ts            # Supabase client instance
│   │   └── utils.ts               # Utility functions (getDurationString)
│   └── pages/
│       ├── admin/                 # Admin panel pages
│       │   ├── index.tsx          # Admin layout + tab router
│       │   ├── Dashboard.tsx      # Overview stats + filters
│       │   ├── Students.tsx       # Student CRUD + CSV import
│       │   ├── Mentors.tsx        # Mentor CRUD + CSV import
│       │   ├── OJTs.tsx           # OJT program management
│       │   ├── Tasks.tsx          # Task CRUD
│       │   ├── Submissions.tsx    # Submission review + comments
│       │   ├── Credits.tsx        # Cloud credit management
│       │   ├── Attendance.tsx     # Attendance grid
│       │   └── EvaluationTracker.tsx  # Viva/OJT marks + attendance %
│       ├── mentor/                # Mentor panel pages
│       │   ├── index.tsx          # Mentor layout + tab router
│       │   ├── Dashboard.tsx      # Mentor-scoped overview
│       │   ├── Students.tsx       # Read-only student list
│       │   ├── OJTs.tsx           # Project upload + student assignment
│       │   ├── Tasks.tsx          # Task management
│       │   ├── Submissions.tsx    # Submission review + comments
│       │   ├── Comments.tsx       # Comment viewing
│       │   ├── Credits.tsx        # Credit viewing
│       │   ├── Attendance.tsx     # Attendance grid
│       │   └── EvaluationTracker.tsx  # Evaluation tracker
│       └── student/               # Student panel pages
│           ├── index.tsx          # Student layout + tab router
│           ├── Dashboard.tsx      # Student-scoped overview
│           ├── ProjectPicker.tsx  # Project selection UI
│           ├── Tasks.tsx          # Task list + progress bar
│           ├── Submissions.tsx    # Submit deliverables + view feedback
│           ├── Credits.tsx        # Cloud credit viewing
│           └── Attendance.tsx     # Attendance viewing
├── index.html                     # HTML shell
├── package.json                   # Dependencies + scripts
├── tailwind.config.js             # Tailwind customization
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite config
└── eslint.config.js               # ESLint config
```

---

## Routing Model

The application uses **client-side tab routing** (no React Router). Navigation is handled via a `panel` state at the `App.tsx` level and `activeTab` state within each panel's `index.tsx`.

```
App.tsx
├── Landing Page (panel = 'landing')
│   ├── [Admin Panel] button  → panel = 'admin'
│   ├── [Mentor Panel] button → panel = 'mentor'
│   └── [Student Panel] button → panel = 'student'
│
├── AdminPanel (panel = 'admin')
│   └── Sidebar tabs → activeTab switch/case
│
├── MentorPanel (panel = 'mentor')
│   └── Sidebar tabs → activeTab switch/case
│
└── StudentPanel (panel = 'student')
    └── Sidebar tabs → activeTab switch/case
```

> **Note**: There is no URL-based routing yet. Navigating directly to a tab via URL is not supported. This is planned for future implementation with React Router or Next.js.

---

## Data Flow

```
useMockData() hook
    ├── Reads from localStorage on mount
    ├── Returns data + mutation functions
    └── Writes to localStorage on every mutation
         │
         ▼
Panel index.tsx (e.g., admin/index.tsx)
    ├── Calls useMockData()
    ├── Passes data slices + mutations as props to page components
    └── Each page component renders UI from props
```

> **Planned**: Replace `useMockData()` with Supabase queries. The Supabase client is already initialized in `src/lib/supabase.ts`, and the database schema migration is ready in `supabase/migrations/`.
