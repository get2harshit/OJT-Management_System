import { ArrowLeft, LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CohortPageHeaderProps {
  title: string;
  subtitle?: string;
  // Optional — matches the icon shown next to this same page's entry point
  // on the list page it was navigated from (e.g. Allocations.tsx's Shuffle
  // icon for "Project Allocations"), so the two pages read as one flow.
  icon?: LucideIcon;
  /**
   * Rendered inline after the title — live counts, a filter, a status pill.
   *
   * Inline rather than on its own row because the whole point of this header
   * is to be one line: anything given its own row costs the table underneath
   * it as much height as the title did.
   */
  trailing?: React.ReactNode;
}

/**
 * Shared header for the cohort action pages: a Back button, the title, and
 * whatever the page wants beside it.
 *
 * Deliberately small — one line, title at text-sm. It used to be a text-2xl
 * heading with the cohort on a second line, and on a page whose job is a table
 * that was the wrong trade: the header is read once on arrival, the table is
 * read for as long as the page is open, and the header was taking a chunk of
 * the rows' height to say something already known from the click that got here.
 * Allocation Blueprint had quietly grown its own compact header for exactly
 * this reason; this is that one, made shared, so the pages stop disagreeing.
 *
 * The subtitle sits inline behind an em dash instead of wrapping to its own
 * row — same information, no second line.
 */
export default function CohortPageHeader({ title, subtitle, icon: Icon, trailing }: CohortPageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors shrink-0"
        title="Back"
      >
        <ArrowLeft size={18} />
      </button>
      {Icon && <Icon className="text-gold shrink-0" size={16} />}
      <h1 className="text-sm font-semibold text-white shrink-0">{title}</h1>
      {subtitle && <span className="text-xs text-gray-500 shrink-0">— {subtitle}</span>}
      {trailing}
    </div>
  );
}
