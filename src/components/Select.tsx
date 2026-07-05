import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 'field' matches form-input selects (zinc-750/white); 'filter' matches
   * the lighter filter-bar look (zinc-850/gray-300) used on dashboards. */
  variant?: 'field' | 'filter';
}

const VARIANT_STYLES: Record<'field' | 'filter', string> = {
  field: 'bg-zinc-750 border-zinc-750 text-white',
  filter: 'bg-zinc-850 border-zinc-750 text-gray-300',
};

// Themed drop-in replacement for native <select>: a browser's own open
// dropdown list is rendered by the OS, ignoring app CSS entirely (it shows
// up with the OS's default highlight color instead of the app's theme).
// This renders its own portal-based list instead, styled to match.
export default function Select({ value, onChange, options, placeholder, disabled, className = '', variant = 'field' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left transition-colors ${VARIANT_STYLES[variant]} ${
          disabled ? 'text-gray-400 cursor-not-allowed opacity-70' : 'hover:border-zinc-650'
        } ${open && !disabled ? 'border-gold' : ''} ${className}`}
      >
        <span className={`truncate ${!selected ? 'text-gray-500' : ''}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
          className="max-h-64 overflow-y-auto bg-zinc-850 border border-zinc-750 rounded-lg shadow-2xl z-50 py-1"
        >
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                value === '' ? 'text-gold bg-gold/10' : 'text-gray-400 hover:bg-zinc-750 hover:text-white'
              }`}
            >
              <span className="truncate">{placeholder}</span>
              {value === '' && <Check size={14} className="shrink-0" />}
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                value === opt.value ? 'text-gold bg-gold/10' : 'text-gray-300 hover:bg-zinc-750 hover:text-white'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
