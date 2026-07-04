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
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={`relative bg-zinc-850 border border-zinc-750 rounded-xl w-full ${SIZE_CLASSES[size]} shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-zinc-750 shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 sm:px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
