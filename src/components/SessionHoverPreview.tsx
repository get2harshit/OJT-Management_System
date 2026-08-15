import { MapPin, Users2 } from 'lucide-react';
import type { ApiSession } from '../lib/api';

interface Props {
  session: ApiSession;
  left: number;
  top: number;
  statusColor: string;
  showMentor?: boolean;
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A hover-only quick-look card for a calendar event — click still opens the full detail modal. */
export default function SessionHoverPreview({ session, left, top, statusColor, showMentor }: Props) {
  const teamNames = session.teams.map((t) => t.team.name).join(', ') || '—';
  return (
    <div
      className="fixed z-50 pointer-events-none w-64 bg-zinc-900 border border-zinc-750 rounded-lg shadow-xl px-3 py-2.5 text-xs space-y-1.5"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ backgroundColor: `${statusColor}25`, color: statusColor }}>
          {session.status}
        </span>
        {session.self_scheduled && <span className="text-[9px] text-gray-500">Self-scheduled</span>}
      </div>
      {showMentor && <p className="text-white font-semibold truncate">{session.mentor.full_name}</p>}
      {session.title && <p className="text-white font-semibold truncate">{session.title}</p>}
      <p className="flex items-center gap-1.5 text-gray-300">
        <Users2 size={11} className="text-gold shrink-0" />
        <span className="truncate">{teamNames}</span>
      </p>
      <p className="text-gray-400">
        {timeLabel(session.start_time)} – {timeLabel(session.end_time)}
      </p>
      {session.location_or_link && (
        <p className="flex items-center gap-1.5 text-gray-400">
          <MapPin size={11} className="text-gold shrink-0" />
          <span className="truncate">{session.location_or_link}</span>
        </p>
      )}
    </div>
  );
}
