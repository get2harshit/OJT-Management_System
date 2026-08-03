import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'lg' | 'xl';
}

const SIZE_CLASSES: Record<'lg' | 'xl', string> = {
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

export default function Modal({ open, onClose, title, children, size = 'lg' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    if (open) {
      window.addEventListener('keydown', handleKey);
      ref.current?.focus();
    }
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={`relative bg-zinc-850 border border-zinc-750 rounded-2xl w-full ${SIZE_CLASSES[size]} shadow-2xl shadow-black/50 ring-1 ring-white/[0.04] animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col overflow-hidden outline-none`}
      >
        <div className="h-1 bg-gradient-to-r from-gold/50 via-gold to-gold/50 shrink-0" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-750 shrink-0">
          <h3 id="modal-title" className="text-lg font-semibold text-white tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-5 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
