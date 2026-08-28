import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useAnchoredPosition } from '../hooks/useAnchoredPosition';

export interface SelectOption {
  value: string;
  label: string;
  // Optional second line shown under an option's label in the open list only
  // (the closed trigger stays single-line — no room, and it's not needed
  // once something's already picked) — a colour-dot tag, e.g. an Internal/
  // Industry mentor split, using the same dot+text shape status badges use
  // elsewhere (see statusDotClass) rather than inventing a new one.
  sublabel?: string;
  // Tailwind bg-* class for the dot. Defaults to a neutral gray.
  sublabelDotClass?: string;
}

interface SelectBaseProps {
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** 'field' matches form-input selects (zinc-750/white); 'filter' matches
   * the lighter filter-bar look (zinc-850/gray-300) used on dashboards. */
  variant?: 'field' | 'filter';
  isSearchable?: boolean;
  isCreatable?: boolean;
  /** Overrides the trigger's text colour once something is selected — e.g.
   * a status select whose value should read green/red/amber rather than
   * the variant's plain text colour. Ignored while showing the placeholder. */
  tone?: string;
}

// value/onChange are typed off isMulti rather than being one loose
// `string | string[]` pair, because the two modes genuinely have different
// contracts: single hands back the chosen option, multi the whole array. A
// shared signature forced every call site to cast, which is what let the
// original `any` in — and a cast is exactly where a multi-select's array
// silently reaches a handler expecting a string.
interface SingleSelectProps extends SelectBaseProps {
  isMulti?: false;
  value: string;
  onChange: (value: string) => void;
}

interface MultiSelectProps extends SelectBaseProps {
  isMulti: true;
  value: string[];
  onChange: (value: string[]) => void;
}

type SelectProps = SingleSelectProps | MultiSelectProps;

const VARIANT_STYLES: Record<'field' | 'filter', string> = {
  field: 'bg-zinc-750 border-zinc-750 text-white',
  filter: 'bg-zinc-850 border-zinc-750 text-gray-300',
};

// Themed drop-in replacement for native <select>: a browser's own open
// dropdown list is rendered by the OS, ignoring app CSS entirely (it shows
// up with the OS's default highlight color instead of the app's theme).
// This renders its own portal-based list instead, styled to match.
export default function Select(props: SelectProps) {
  const { options, placeholder, disabled, className = '', variant = 'field', isMulti = false, isSearchable = false, isCreatable = false, tone } = props;
  // The union is enforced at the call boundary above; inside, the body handles
  // both shapes and needs the widened form. One cast here replaces the one
  // every caller used to write.
  const value = props.value as string | string[];
  const onChange = props.onChange as (value: string | string[]) => void;

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Matches the trigger's width so the list reads as an extension of it.
  const position = useAnchoredPosition(
    triggerRef,
    open,
    rect => ({ top: rect.bottom + 4, left: rect.left, width: rect.width }),
    { top: 0, left: 0, width: 0 },
  );

  const selected = isMulti
    ? options.filter(o => Array.isArray(value) && value.includes(o.value))
    : options.find(o => o.value === value);

  const selectedItems = isMulti ? (selected as SelectOption[]) : [];
  const singleSelected = !isMulti ? (selected as SelectOption | undefined) : null;

  const renderLabel = () => {
    if (isMulti) {
      if (selectedItems.length === 0) {
        return <span className="text-gray-500 truncate">{placeholder || 'Select...'}</span>;
      }
      if (selectedItems.length === 1) {
        return <span className="truncate">{selectedItems[0].label}</span>;
      }
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30 shrink-0">
          {selectedItems.length} Selected
        </span>
      );
    }
    if (singleSelected) {
      return <span className={`truncate ${tone ?? ''}`}>{singleSelected.label}</span>;
    }
    return <span className="text-gray-500 truncate">{placeholder || 'Select...'}</span>;
  };

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(searchQuery.toLowerCase()));

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
        // The trigger truncates long labels with an ellipsis — a native
        // tooltip is the only way to recover the full text without opening
        // the list, e.g. a name cut off mid-word in a narrow filter chip.
        title={!isMulti ? singleSelected?.label : undefined}
        onClick={() => setOpen(prev => {
          if (!prev) setSearchQuery('');
          return !prev;
        })}
        className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm text-left transition-colors ${VARIANT_STYLES[variant]} ${
          disabled ? 'text-gray-400 cursor-not-allowed opacity-70' : 'hover:border-zinc-650'
        } ${open && !disabled ? 'border-gold' : ''} ${className}`}
      >
        <div className="min-w-0 flex-1 flex items-center">
          {renderLabel()}
        </div>
        <ChevronDown size={15} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
          className="max-h-64 overflow-y-auto bg-zinc-850 border border-zinc-750 rounded-lg shadow-2xl z-[200] py-1"
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
          {filteredOptions.length === 0 && !isCreatable && (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">No results found</div>
          )}
          {filteredOptions.length === 0 && isCreatable && searchQuery.trim() === '' && (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">Type to create...</div>
          )}
          {isCreatable && searchQuery.trim() !== '' && !options.some(o => o.label.toLowerCase() === searchQuery.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => {
                const val = searchQuery.trim();
                if (isMulti) {
                  const valArr = value as string[];
                  if (!valArr.includes(val)) {
                    onChange([...valArr, val]);
                  }
                } else {
                  onChange(val);
                  setOpen(false);
                }
                setSearchQuery('');
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors text-gold hover:bg-zinc-750 font-medium border-b border-zinc-750 mb-1"
            >
              <span className="truncate">Create "{searchQuery.trim()}"</span>
              <Check size={14} className="shrink-0 opacity-0" />
            </button>
          )}
          {filteredOptions.map(opt => {
            const isSelected = isMulti ? (value as string[]).includes(opt.value) : value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.sublabel ? `${opt.label} — ${opt.sublabel}` : opt.label}
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
                <div className="min-w-0 flex-1">
                  <span className="truncate block">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.sublabelDotClass ?? 'bg-gray-500'}`} />
                      <span className="truncate">{opt.sublabel}</span>
                    </span>
                  )}
                </div>
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
