import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, X } from 'lucide-react';
import SpinnerSquare from './SpinnerSquare';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Must be configured in the same module that renders <Document>/<Page> —
// setting it elsewhere (e.g. main.tsx) risks another react-pdf import
// resetting it back to the default before this one runs.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const VIEWER_PADDING = 16; // matches the scroll container's p-2 on each side
// Fullscreen fits the page to the available height by default, which reads
// as slightly small — this bumps it up a bit; the container already
// scrolls, so a page that's now a little taller than the viewport is fine.
const FULLSCREEN_ZOOM = 1.45;
// Filling the compact viewer's full width read as a bit too large — backs
// it off slightly.
const COMPACT_ZOOM = 0.85;
const COMPACT_MIN_HEIGHT = 360;
// Space reserved below the compact viewer for the review action buttons
// that sit right underneath it in the page — keeps the fit-to-viewport
// height from pushing them off-screen.
const COMPACT_BOTTOM_RESERVE = 120;

interface PdfViewerProps {
  url: string;
  // Rendered below the page only in fullscreen mode (e.g. the mentor's
  // feedback box + Approve/Request Changes controls) — the compact view
  // already has this content right below it in the page layout, so it
  // isn't duplicated there.
  fullscreenExtra?: ReactNode;
}

// Embedded PRD viewer for the mentor/student review screens. Falls back to a
// plain "open in new tab" link if the PDF fails to load — most commonly
// because the GCS bucket doesn't have CORS enabled yet for this origin,
// which react-pdf's fetch-based loading requires (unlike a plain <a>/<iframe>).
export default function PdfViewer({ url, fullscreenExtra }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [compactHeight, setCompactHeight] = useState(COMPACT_MIN_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // react-pdf's text/annotation layers can grab focus as they finish
  // rendering, which drags the scroll container down with them — force it
  // back to the top of the page every time a render completes.
  const resetScroll = () => {
    scrollRef.current?.scrollTo(0, 0);
  };

  // Tracks the scroll container's own box so the page can be sized to fill
  // it (fullscreen fits by height so the whole page is visible without
  // scrolling; the compact view fits by width to shrink its side padding).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // Fits the compact (non-fullscreen) viewer to whatever vertical room is
  // left in the viewport below it, instead of a fixed height, so it makes
  // better use of tall/wide screens.
  useEffect(() => {
    if (isFullscreen) return;
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - COMPACT_BOTTOM_RESERVE;
      setCompactHeight(Math.max(COMPACT_MIN_HEIGHT, available));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  if (loadError) {
    return (
      <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-6 text-center space-y-2">
        <p className="text-sm text-gray-400">Couldn't load the preview.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-hover font-medium"
        >
          <ExternalLink size={14} />
          Open in new tab
        </a>
      </div>
    );
  }

  // Floats directly on top of the page instead of taking its own row below
  // — keeps the viewer compact and puts the controls where you're looking.
  const pageNavOverlay = numPages && numPages > 1 && (
    <>
      <button
        onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
        disabled={pageNumber <= 1}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-gold hover:text-black disabled:opacity-0 disabled:pointer-events-none transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
        disabled={pageNumber >= numPages}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-gold hover:text-black disabled:opacity-0 disabled:pointer-events-none transition-colors"
        aria-label="Next page"
      >
        <ChevronRight size={18} />
      </button>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
        Page {pageNumber} of {numPages}
      </span>
    </>
  );

  const handleLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPageNumber(1);
  };

  if (isFullscreen) {
    // Portalled straight to <body> — rendered inline, this div is still a
    // flex child of whatever space-y-* card wraps the viewer, and CSS
    // margin still applies to a fixed/inset-0 box even though it's out of
    // flow, which was pushing the "fullscreen" overlay down from the real
    // viewport edge.
    return createPortal(
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-end px-4 py-3 border-b border-zinc-750 shrink-0">
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            aria-label="Close fullscreen"
          >
            <X size={22} />
          </button>
        </div>

        <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} className="h-full overflow-auto flex justify-center p-2">
            <Document
              file={url}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={(err) => setLoadError(err.message)}
              loading={
                <div className="flex items-center justify-center py-16">
                  <SpinnerSquare size={48} />
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                height={viewerSize.height ? (viewerSize.height - VIEWER_PADDING) * FULLSCREEN_ZOOM : undefined}
                onRenderSuccess={resetScroll}
              />
            </Document>
          </div>
          {pageNavOverlay}
        </div>

        {fullscreenExtra && (
          <div className="border-t border-zinc-750 p-4 shrink-0 max-h-[40vh] overflow-auto bg-zinc-900">
            {fullscreenExtra}
          </div>
        )}
      </div>,
      document.body
    );
  }

  return (
    <div ref={wrapperRef} className="relative bg-zinc-900 border border-zinc-750 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsFullscreen(true)}
        className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white rounded-md transition-colors"
        aria-label="Expand"
        title="Expand"
      >
        <Maximize2 size={16} />
      </button>

      <div className="relative" style={{ maxHeight: compactHeight }}>
        <div ref={scrollRef} className="overflow-auto flex justify-center items-start p-2" style={{ maxHeight: compactHeight }}>
          <Document
            file={url}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={(err) => setLoadError(err.message)}
            loading={
              <div className="flex items-center justify-center py-16">
                <SpinnerSquare size={48} />
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={viewerSize.width ? (viewerSize.width - VIEWER_PADDING) * COMPACT_ZOOM : undefined}
              onRenderSuccess={resetScroll}
            />
          </Document>
        </div>
        {pageNavOverlay}
      </div>
    </div>
  );
}
