import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';

interface ReviewActionsProps {
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
  disabled?: boolean;
}

// Lives inline inside SubmissionDetail's persistent feedback panel (always
// visible next to the document), not behind a button — so feedback is
// written right where the mentor is looking at the doc, not in a separate
// overlay. Resubmit still requires non-empty feedback before it can be sent.
// Labeled "Resubmit", not "Request Changes"/"Reject" — see
// feedback_task_ui_naming; onRequestChanges/the API's `changes_requested`
// value are internal names only, this is purely the display text.
export default function ReviewActions({ onApprove, onRequestChanges, disabled }: ReviewActionsProps) {
  const [feedback, setFeedback] = useState('');

  const handleSend = () => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    onRequestChanges(trimmed);
    setFeedback('');
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Feedback for student</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What needs to be changed? (required to resubmit)"
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold transition-colors resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={handleSend}
          disabled={disabled || !feedback.trim()}
          className="w-full py-2.5 flex items-center justify-center gap-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors text-sm font-medium disabled:opacity-50 border border-red-500/20"
        >
          <RotateCcw size={16} />
          Resubmit
        </button>
        <button
          onClick={onApprove}
          disabled={disabled}
          className="w-full py-2.5 flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors text-sm font-medium disabled:opacity-50"
        >
          <CheckCircle2 size={16} />
          Approve
        </button>
      </div>
    </div>
  );
}
