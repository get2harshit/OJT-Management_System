# 📘 OJT Management System — Project Documentation

> A comprehensive, living documentation hub for the OJT Management System.
> Use this directory to track features, architecture, database schema, endpoints, and progress over time.

---

## 📂 Documentation Index

| Document | Description |
|---|---|
| [architecture.md](./architecture.md) | High-level system architecture, tech stack, and directory structure |
| [database-schema.md](./database-schema.md) | Complete database tables, enums, relationships, and indexes |
| [features.md](./features.md) | Feature inventory by role (Admin, Mentor, Student) with status tracking |
| [components.md](./components.md) | Shared UI component library reference |
| [data-layer.md](./data-layer.md) | Data layer — mock data hook, Supabase client, and state management |
| [api-endpoints.md](./api-endpoints.md) | API endpoints / data operations reference (current mock + planned Supabase) |
| [changelog.md](./changelog.md) | Running changelog to track progress over time |

---

## 🏁 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Typecheck
npm run typecheck

# Build
npm run build
```

**Local URL**: [http://localhost:5175/](http://localhost:5175/)

---

## 🎯 Current State

- **Phase**: Frontend Staging (Mock Data)
- **Backend**: Supabase (schema ready, not yet wired)
- **Auth**: Not implemented (panel-switch landing page)
- **Data Persistence**: localStorage via `useMockData` hook
