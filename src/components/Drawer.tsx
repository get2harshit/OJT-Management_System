import { X } from 'lucide-react';
import { useEffect } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
}

export default function Drawer({ open, onClose, title, children, widthClassName = 'max-w-md' }: DrawerProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 w-full ${widthClassName} bg-zinc-850 border-l border-zinc-750 shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-750 shrink-0">
          <h3 id="drawer-title" className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close drawer" className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-750">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-5 overflow-y-auto flex-1 scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
