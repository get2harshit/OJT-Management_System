import { Briefcase } from 'lucide-react';
import CohortsPanel from './CohortsPanel';

export default function AdminOJTs() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Briefcase className="text-gold" size={26} />
          OJT Setup & Program Management
        </h1>
        <p className="text-gray-400 text-sm mt-1">Configure academic term cohorts and publish project catalogs</p>
      </div>

      <CohortsPanel />
    </div>
  );
}
