import type { ReactNode } from 'react';

interface SplitPaneProps {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidthClassName?: string;
  // Shrinks the sidebar to nothing (e.g. while a document is open) so the
  // detail pane can use the freed-up width. The sidebar's own state (search
  // text, scroll position) stays mounted underneath, so it snaps back
  // instantly once uncollapsed.
  sidebarCollapsed?: boolean;
}

// Left roster/list + right detail layout, shared by the Submissions pages for
// all three roles. Lifted from the two-column flex structure originally
// built for admin/Tasks.tsx's "Assignee Progress Board" modal, generalized
// for use as an inline page section instead of inside a Modal.
export default function SplitPane({ sidebar, children, sidebarWidthClassName = 'w-64', sidebarCollapsed }: SplitPaneProps) {
  return (
    <div className="flex flex-1 min-h-0 bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
      <div
        className={`shrink-0 border-zinc-750 flex flex-col overflow-hidden transition-all duration-200 ${
          sidebarCollapsed ? 'w-0 border-r-0' : `${sidebarWidthClassName} border-r`
        }`}
      >
        {sidebar}
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
