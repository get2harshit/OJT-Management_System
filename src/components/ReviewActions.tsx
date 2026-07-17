import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, RotateCcw, X } from 'lucide-react';

interface ReviewActionsProps {
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
  disabled?: boolean;
}

// Approve needs no explanation, so it's a single click. Requesting changes
// always needs one, so it opens a side panel to collect it instead of
// keeping a feedback box on screen at all times.
export default function ReviewActions({ onApprove, onRequestChanges, disabled }: ReviewActionsProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const closePanel = () => {
    setPanelOpen(false);
    setFeedback('');
  };

  const handleSubmit = () => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    onRequestChanges(trimmed);
    closePanel();
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onApprove}
          disabled={disabled}
          title="Approve"
          aria-label="Approve"
          className="p-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 size={18} />
        </button>
        <button
          onClick={() => setPanelOpen(true)}
          disabled={disabled}
          title="Request Changes"
          aria-label="Request Changes"
          className="p-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {panelOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closePanel} />
          <div className="relative w-full sm:w-96 h-full bg-zinc-900 border-l border-zinc-750 p-5 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-base">Request Changes</h3>
              <button onClick={closePanel} className="p-1 text-gray-400 hover:text-white transition-colors" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What needs to be changed?"
              className="flex-1 w-full bg-zinc-850 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
            />
            <button
              onClick={handleSubmit}
              disabled={disabled || !feedback.trim()}
              className="w-full py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
            >
              Send to Student
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
