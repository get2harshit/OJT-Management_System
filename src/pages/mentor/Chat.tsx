import { MessageSquare, HelpCircle, FolderOpen, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/PageLayout';

/**
 * Placeholder for direct mentor <-> student messaging.
 *
 * Deliberately not an empty "coming soon" card: until it ships there are two
 * real places this conversation already happens, and pointing at them is more
 * use to a mentor than an apology.
 */
export default function MentorChat() {
  const navigate = useNavigate();

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={24} className="text-gold" />
          Chat
        </h1>
        <p className="text-gray-400 text-sm mt-1">Direct messaging with your students.</p>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-8 max-w-2xl">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gold/10 text-gold border border-gold/30">
          <Sparkles size={11} />
          Coming soon
        </span>

        <h2 className="text-lg font-semibold text-white mt-4">
          A single thread with each student, in the app
        </h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          Quick back-and-forth that doesn&apos;t need a scheduled session — a question between
          meetings, a nudge on a stalled task, a link you promised to send.
        </p>

        <div className="mt-6 pt-6 border-t border-zinc-750">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-3">Until then</p>
          <div className="space-y-2">
            <Shortcut
              icon={HelpCircle}
              title="Doubt Requests"
              description="Students raise what they're stuck on and you schedule time for it."
              onClick={() => navigate('/mentor/dashboard/doubt-requests')}
            />
            <Shortcut
              icon={FolderOpen}
              title="Submissions"
              description="Written feedback on a submission reaches the student directly."
              onClick={() => navigate('/mentor/dashboard/submissions')}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function Shortcut({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof MessageSquare;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3.5 py-3 hover:border-gold/50 transition-colors"
    >
      <Icon size={16} className="text-gold shrink-0 mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm text-white font-medium">{title}</span>
        <span className="block text-xs text-gray-400 mt-0.5">{description}</span>
      </span>
    </button>
  );
}
