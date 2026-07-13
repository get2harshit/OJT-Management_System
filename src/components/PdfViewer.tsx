import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
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

interface PdfViewerProps {
  url: string;
}

// Embedded PRD viewer for the mentor/student review screens. Falls back to a
// plain "open in new tab" link if the PDF fails to load — most commonly
// because the GCS bucket doesn't have CORS enabled yet for this origin,
// which react-pdf's fetch-based loading requires (unlike a plain <a>/<iframe>).
export default function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="bg-zinc-900 border border-zinc-750 rounded-lg overflow-hidden">
      <div className="flex justify-center items-start max-h-[600px] overflow-auto p-3">
        <Document
          file={url}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            setPageNumber(1);
          }}
          onLoadError={(err) => setLoadError(err.message)}
          loading={
            <div className="flex items-center justify-center py-16">
              <SpinnerSquare size={48} />
            </div>
          }
        >
          <Page pageNumber={pageNumber} width={640} />
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className="flex items-center justify-center gap-4 border-t border-zinc-750 py-2.5">
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
      )}
    </div>
  );
}
