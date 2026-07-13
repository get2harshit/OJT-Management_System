import { useEffect, useState } from 'react';
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

const COMPACT_PAGE_WIDTH = 640;

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
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const pageNav = numPages && numPages > 1 && (
    <div className="flex items-center justify-center gap-4 border-t border-zinc-750 py-2.5 shrink-0">
      <button
        onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
        disabled={pageNumber <= 1}
        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-xs text-gray-400 font-medium">
        Page {pageNumber} of {numPages}
      </span>
      <button
        onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
        disabled={pageNumber >= numPages}
        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
        aria-label="Next page"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );

  const handleLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPageNumber(1);
  };

  if (isFullscreen) {
    const fullscreenPageWidth = Math.min(900, viewportWidth - 80);
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-750 shrink-0">
          <span className="text-xs text-gray-400 font-medium">
            {numPages ? `Page ${pageNumber} of ${numPages}` : ''}
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            aria-label="Close fullscreen"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex justify-center p-4">
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
            <Page pageNumber={pageNumber} width={fullscreenPageWidth} />
          </Document>
        </div>

        {pageNav}

        {fullscreenExtra && (
          <div className="border-t border-zinc-750 p-4 shrink-0 max-h-[40vh] overflow-auto bg-zinc-900">
            {fullscreenExtra}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-zinc-900 border border-zinc-750 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsFullscreen(true)}
        className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white rounded-md transition-colors"
        aria-label="Expand"
        title="Expand"
      >
        <Maximize2 size={16} />
      </button>

      <div className="flex justify-center items-start max-h-[400px] overflow-auto p-3">
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
          <Page pageNumber={pageNumber} width={COMPACT_PAGE_WIDTH} />
        </Document>
      </div>

      {pageNav}
    </div>
  );
}
