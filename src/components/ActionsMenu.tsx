import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAnchoredPosition } from '../hooks/useAnchoredPosition';

export interface ActionsMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

interface ActionsMenuProps {
  items: ActionsMenuItem[];
}

const MENU_WIDTH = 176;

// Single "⋮" trigger per row that opens a dropdown of actions, so a table row
// doesn't need one standalone icon button per action. Rendered through a
// portal (fixed-positioned against the trigger button) so it isn't clipped
// by DataTable's overflow-x-auto scroll container.
export default function ActionsMenu({ items }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Right-aligned to the trigger, since this sits in a row's last column and
  // a left-aligned menu would hang off the table. The floor keeps it on screen
  // when the trigger is close to the left edge on a narrow viewport.
  const position = useAnchoredPosition(
    triggerRef,
    open,
    rect => ({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) }),
    { top: 0, left: 0 },
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', () => setOpen(false), { capture: true, once: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(prev => !prev)}
        className="p-1.5 text-gray-400 hover:text-white hover:bg-zinc-750 rounded-md transition-colors"
        title="Actions"
      >
        <MoreVertical size={18} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: position.top, left: position.left, width: MENU_WIDTH }}
          className="bg-zinc-850 border border-zinc-750 rounded-lg shadow-2xl z-50 py-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                item.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-gray-300 hover:bg-zinc-750 hover:text-white'
              }`}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
