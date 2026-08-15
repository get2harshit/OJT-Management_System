import { MapPin, Video } from 'lucide-react';
import type { ApiSessionStatus } from '../lib/api/sessions';
import { classifySessionLocation, isJoinable, isWithinJoinWindow } from '../lib/sessionLocation';

interface SessionJoinLinkProps {
  locationOrLink: string | null;
  startTime: string;
  endTime: string;
  status: ApiSessionStatus;
  /**
   * 'cell' for a table column, 'detail' for a drawer's body. Same rules, same
   * words — only the size changes, so a session does not describe itself
   * differently depending on where you happen to be looking at it.
   */
  variant?: 'cell' | 'detail';
}

/**
 * The location of a session, and — when that location is a URL — the way in.
 *
 * Admin, mentor and student all render this. They used to each print the raw
 * field as grey text beside a pin icon, which meant a Meet link was something
 * you selected and copied rather than something you clicked, and a student on a
 * phone effectively could not join at all.
 *
 * A physical location still renders exactly as before. That is deliberate: most
 * of the value here is for links, and none of it is worth regressing "Room 204"
 * into a broken hyperlink.
 */
export default function SessionJoinLink({ locationOrLink, startTime, endTime, status, variant = 'detail' }: SessionJoinLinkProps) {
  const location = classifySessionLocation(locationOrLink);
  const compact = variant === 'cell';

  if (location.kind === 'none') return <span className="text-gray-500">—</span>;

  if (location.kind === 'place') {
    return (
      <span className={`flex items-center gap-1.5 ${compact ? 'text-xs' : ''}`}>
        <MapPin size={compact ? 12 : 14} className="text-gold shrink-0" />
        <span className="truncate">{location.label}</span>
      </span>
    );
  }

  // A link on a session that is cancelled or over: still shown, because "where
  // was it" stays a real question afterwards, but never as a way in.
  if (!isJoinable(status)) {
    return (
      <span className={`flex items-center gap-1.5 text-gray-500 ${compact ? 'text-xs' : ''}`}>
        <Video size={compact ? 12 : 14} className="shrink-0" />
        <span className="truncate line-through">{location.label}</span>
      </span>
    );
  }

  const live = isWithinJoinWindow(startTime, endTime);

  return (
    <a
      href={location.href}
      target="_blank"
      // The value is typed by a mentor and can point anywhere, so the opened
      // tab must not get a handle back to this one.
      rel="noopener noreferrer"
      title={location.label}
      className={
        live
          ? `inline-flex items-center gap-1.5 font-semibold rounded-lg bg-gold text-black hover:bg-gold-hover transition-colors ${compact ? 'text-xs px-2.5 py-1' : 'text-xs px-3 py-1.5'}`
          : `inline-flex items-center gap-1.5 font-semibold rounded-lg bg-zinc-750 text-gray-300 hover:bg-zinc-700 hover:text-white transition-colors ${compact ? 'text-xs px-2.5 py-1' : 'text-xs px-3 py-1.5'}`
      }
    >
      <Video size={compact ? 12 : 14} className="shrink-0" />
      {live ? 'Join now' : 'Open link'}
    </a>
  );
}
