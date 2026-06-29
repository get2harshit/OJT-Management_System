# 🧩 Shared UI Components

> Reusable components used across Admin, Mentor, and Student panels.

---

## `DataTable<T>`

**File**: [`src/components/DataTable.tsx`](../src/components/DataTable.tsx)

A generic, searchable, paginated data table.

### Props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `columns` | `Column<T>[]` | ✅ | — | Column definitions |
| `data` | `T[]` | ✅ | — | Row data array |
| `searchPlaceholder` | `string` | — | `"Search..."` | Placeholder text for search input |
| `searchKeys` | `(keyof T)[]` | — | All keys | Which fields to search |
| `actions` | `(row: T) => ReactNode` | — | — | Render action buttons per row |

### Column Definition

```ts
interface Column<T> {
  key: keyof T | string;   // Data key to display
  header: string;          // Column header text
  render?: (row: T) => ReactNode;  // Custom cell renderer
}
```

### Features
- 🔍 Full-text search across specified keys
- 📄 Pagination (10 rows per page)
- ⚡ Custom cell renderers via `render` prop
- 🎬 Row actions column (edit, delete buttons)

### Usage Example

```tsx
<DataTable
  columns={[
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (row) => <Badge>{row.role}</Badge> },
  ]}
  data={profiles}
  searchPlaceholder="Search users..."
  actions={(row) => (
    <button onClick={() => deleteProfile(row.id)}>
      <Trash2 size={16} />
    </button>
  )}
/>
```

---

## `Modal`

**File**: [`src/components/Modal.tsx`](../src/components/Modal.tsx)

A centered overlay modal dialog with backdrop blur.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `open` | `boolean` | ✅ | Controls visibility |
| `onClose` | `() => void` | ✅ | Close handler |
| `title` | `string` | ✅ | Modal header text |
| `children` | `ReactNode` | ✅ | Modal body content |

### Features
- ✖️ Close via Escape key
- 🌫️ Backdrop blur + dark overlay
- 🔲 Click outside to close
- ✨ Zoom-in entrance animation

### Usage Example

```tsx
<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Task">
  <form>
    <input type="text" placeholder="Task title" />
    <button onClick={handleSave}>Save</button>
  </form>
</Modal>
```

---

## `Sidebar`

**File**: [`src/components/Sidebar.tsx`](../src/components/Sidebar.tsx)

A collapsible sidebar navigation panel. Renders different tab sets depending on the active panel role.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `panel` | `PanelType` | ✅ | Active role (`'admin'` / `'mentor'` / `'student'`) |
| `activeTab` | `string` | ✅ | Currently selected tab ID |
| `onTabChange` | `(tab: string) => void` | ✅ | Tab selection handler |

### Tab Configurations

**Admin** (9 tabs):
`dashboard` → `students` → `mentors` → `ojts` → `tasks` → `submissions` → `credits` → `attendance` → `evaluation`

**Mentor** (7 tabs):
`dashboard` → `students` → `ojts` → `tasks` → `submissions` → `attendance` → `evaluation`

**Student** (6 tabs):
`dashboard` → `projects` → `tasks` → `submissions` → `credits` → `attendance`

### Features
- ↔️ Collapsible (icon-only mode)
- 🏷️ Active tab highlight with gold left border
- 🔄 "Switch Panel" button (reloads page)

---

## `StatCard`

**File**: [`src/components/StatCard.tsx`](../src/components/StatCard.tsx)

A dashboard statistics card showing a metric with icon and optional trend indicator.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | ✅ | Metric label (e.g., "Total Students") |
| `value` | `string \| number` | ✅ | Metric value |
| `icon` | `LucideIcon` | ✅ | Lucide icon component |
| `trend` | `string` | — | Trend label (e.g., "+12%") |

### Features
- ✨ Gold hover glow effect
- 📈 Optional green trend badge
- 🎯 Consistent card styling

### Usage Example

```tsx
<StatCard
  title="Total Students"
  value={42}
  icon={Users}
  trend="+5 this week"
/>
```
