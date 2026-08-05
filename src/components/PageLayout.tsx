interface PageLayoutProps {
  children: React.ReactNode;
  /**
   * `fill` (default) — the page is exactly as tall as the viewport and never
   * scrolls itself. Whatever inside it asks to grow (a DataTable) receives the
   * space left over after the headings and filters above it, and scrolls its
   * own rows. The card therefore ends at the bottom of the window whether it
   * holds two rows or two hundred, so nothing below it shifts as data loads.
   *
   * `scroll` — the page scrolls as a whole. For pages that stack more than one
   * table: "the rest of the space" is a single quantity and cannot be handed to
   * two tables at once, so there each one is capped instead.
   */
  mode?: 'fill' | 'scroll';
  className?: string;
}

/**
 * The bounded column every panel page sits in.
 *
 * AppShell already gives its content a definite height, but that only reaches
 * as far as the page's own root element — and each page used to write that
 * element by hand. Four different spellings were in use (`space-y-6`,
 * `space-y-6 h-full flex flex-col`, `space-y-4 flex-1 min-h-0 flex flex-col`,
 * and nothing at all), and only the third actually continued the chain. On the
 * rest the height stopped being definite right there, so a table's `flex-1`
 * had no fixed quantity to take a share of and simply grew to fit its rows —
 * on the Mentors page to 1321px inside an 820px window.
 *
 * Direct children keep their natural height (`shrink-0`) so a heading or filter
 * bar is never squeezed; only something explicitly asking to grow takes the
 * remainder.
 */
export default function PageLayout({ children, mode = 'fill', className = '' }: PageLayoutProps) {
  return (
    <div
      className={`flex-1 min-h-0 flex flex-col [&>*]:shrink-0 ${
        mode === 'scroll' ? 'overflow-y-auto scrollbar-thin' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
