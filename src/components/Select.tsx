import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string | string[];
  onChange: (value: any) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 'field' matches form-input selects (zinc-750/white); 'filter' matches
   * the lighter filter-bar look (zinc-850/gray-300) used on dashboards. */
  variant?: 'field' | 'filter';
  isMulti?: boolean;
  isSearchable?: boolean;
}

const VARIANT_STYLES: Record<'field' | 'filter', string> = {
  field: 'bg-zinc-750 border-zinc-750 text-white',
  filter: 'bg-zinc-850 border-zinc-750 text-gray-300',
};

// Themed drop-in replacement for native <select>: a browser's own open
// dropdown list is rendered by the OS, ignoring app CSS entirely (it shows
// up with the OS's default highlight color instead of the app's theme).
// This renders its own portal-based list instead, styled to match.
export default function Select({ value, onChange, options, placeholder, disabled, className = '', variant = 'field', isMulti = false, isSearchable = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = isMulti
    ? options.filter(o => (value as string[]).includes(o.value))
    : options.find(o => o.value === value);

  const displayLabel = isMulti
    ? ((selected as SelectOption[]).length > 0 ? (selected as SelectOption[]).map(o => o.label).join(', ') : placeholder)
    : ((selected as SelectOption) ? (selected as SelectOption).label : placeholder);

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(searchQuery.toLowerCase()));

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
      if (e.key === 'Escape') {
        // Capture phase + stopPropagation so this only closes the dropdown,
        // not a parent Modal/Drawer also listening for Escape on window.
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen(prev => {
          if (!prev) setSearchQuery('');
          return !prev;
        })}
        className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left transition-colors ${VARIANT_STYLES[variant]} ${
          disabled ? 'text-gray-400 cursor-not-allowed opacity-70' : 'hover:border-zinc-650'
        } ${open && !disabled ? 'border-gold' : ''} ${className}`}
      >
        <span className={`truncate ${(!isMulti && !selected) || (isMulti && (selected as SelectOption[]).length === 0) ? 'text-gray-500' : ''}`}>
          {displayLabel}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
          className="max-h-64 overflow-y-auto bg-zinc-850 border border-zinc-750 rounded-lg shadow-2xl z-50 py-1"
        >
          {isSearchable && (
            <div className="px-2 pb-1 sticky top-0 bg-zinc-850 z-10 border-b border-zinc-750 mb-1">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full bg-zinc-750 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold"
                autoFocus
              />
            </div>
          )}
          {placeholder && !isMulti && (
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
          {isMulti && filteredOptions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const allValues = filteredOptions.map(o => o.value);
                const currentValues = value as string[];
                const allSelected = allValues.every(v => currentValues.includes(v));
                if (allSelected) {
                  onChange(currentValues.filter(v => !allValues.includes(v)));
                } else {
                  onChange(Array.from(new Set([...currentValues, ...allValues])));
                }
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors text-blue-400 font-semibold hover:bg-zinc-750"
            >
              <span className="truncate">
                {filteredOptions.every(v => (value as string[]).includes(v.value)) ? 'Deselect All' : 'Select All'}
              </span>
            </button>
          )}
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">No results found</div>
          )}
          {filteredOptions.map(opt => {
            const isSelected = isMulti ? (value as string[]).includes(opt.value) : value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (isMulti) {
                    const valArr = value as string[];
                    if (valArr.includes(opt.value)) {
                      onChange(valArr.filter(v => v !== opt.value));
                    } else {
                      onChange([...valArr, opt.value]);
                    }
                  } else {
                    onChange(opt.value);
                    setOpen(false);
                  }
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  isSelected ? 'text-gold bg-gold/10' : 'text-gray-300 hover:bg-zinc-750 hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
