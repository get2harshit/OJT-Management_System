import { CheckCircle2, XCircle, X } from 'lucide-react';
import type { ToastVariant } from './types';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; bg: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { border: 'border-gold/30', bg: 'bg-zinc-900/80', icon: CheckCircle2, iconColor: 'text-gold' },
  error: { border: 'border-red-500/30', bg: 'bg-zinc-900/80', icon: XCircle, iconColor: 'text-red-400' },
};

// Single toast card: the visual, no state. ToastProvider owns the list and timing.
export default function Toast({ message, variant, onDismiss }: ToastProps) {
  const { border, bg, icon: Icon, iconColor } = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-center gap-3 backdrop-blur-md ${bg} border ${border} rounded-full shadow-lg shadow-black/50 px-5 py-3 max-w-md animate-in slide-in-from-top-4 fade-in duration-300`}
    >
      <Icon size={18} className={`${iconColor} shrink-0`} />
      <p className="text-sm font-medium text-white tracking-wide">{message}</p>
      <button onClick={onDismiss} className="text-gray-400 hover:text-white transition-colors shrink-0 ml-2">
        <X size={15} />
      </button>
    </div>
  );
}
