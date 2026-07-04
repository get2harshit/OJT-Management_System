import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CohortPageHeaderProps {
  title: string;
  subtitle?: string;
}

// Shared header for the cohort action pages (View/Select Project/Select
// Student/Select Mentor): a Back button plus title, so each page returns to
// wherever the admin navigated from instead of a fixed route.
export default function CohortPageHeader({ title, subtitle }: CohortPageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate(-1)}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors shrink-0"
        title="Back"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-gray-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
