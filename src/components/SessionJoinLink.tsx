import { useState } from 'react';
import { MapPin, Video, Mic } from 'lucide-react';
import type { ApiSession } from '../lib/api/sessions';
import { apiGetSessionJoinToken } from '../lib/api/sessions';
import { classifySessionLocation, isJoinable, isWithinJoinWindow } from '../lib/sessionLocation';
import { useToast } from '../toast';

interface SessionJoinLinkProps {
  session: ApiSession;
  /**
   * 'cell' for a table column, 'detail' for a drawer's body. Same rules, same
   * words — only the size changes, so a session does not describe itself
   * differently depending on where you happen to be looking at it.
   */
  variant?: 'cell' | 'detail';
  /**
   * Offer the mic/camera token as well as the watch-only one. For a mentor or
   * an admin on their own session; a student gets it only where the faculty
   * has opened the session up, which the server decides.
   */
  allowInteractive?: boolean;
}

/**
 * How you get into a session.
 *
 * There are two ways a session runs, and this is the one place that knows the
 * difference. It may be hosted on the multimedia service — started from here,
 * joined with a short-lived per-person token — or it may just carry a
 * location_or_link someone typed, which is either a meeting URL or a room.
 *
 * Hosted wins when both are present: a session that has been started is
 * happening there right now, whatever was pasted into the field beforehand.
 *
 * Admin, mentor and student all render this. They used to each print the raw
 * field as grey text beside a pin icon, so joining meant selecting the link and
 * copying it into the address bar — and on a phone that is close to not being
 * able to join at all.
 */
export default function SessionJoinLink({ session, variant = 'detail', allowInteractive = false }: SessionJoinLinkProps) {
  const { showError } = useToast();
  const [joining, setJoining] = useState('');
  const compact = variant === 'cell';
  const iconSize = compact ? 12 : 14;
  const buttonBase = `inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors ${compact ? 'text-xs px-2.5 py-1' : 'text-xs px-3 py-1.5'}`;

  // Started on the multimedia service and not yet ended.
  const hostedLive = session.live_session_id !== null && !session.live_ended_at;

  const join = async (interactive: boolean) => {
    setJoining(interactive ? 'interactive' : 'viewer');
    try {
      // Fetched at the moment of joining and never held: the token is
      // short-lived and issued for this person, so a cached one would be
      // expired when it mattered and a shared one would let somebody in as
      // someone else.
      const { joinUrl } = await apiGetSessionJoinToken(session.id, { interactive });
      const opened = window.open(joinUrl, '_blank', 'noopener,noreferrer');
      if (!opened) showError('Your browser blocked the popup — allow popups for this site and try again.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not get you into this session');
    } finally {
      setJoining('');
    }
  };

  if (hostedLive) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          onClick={() => join(false)}
          disabled={!!joining}
          title="Join this session"
          className={`${buttonBase} bg-gold text-black hover:bg-gold-hover disabled:opacity-50`}
        >
          <Video size={iconSize} className="shrink-0" />
          {joining === 'viewer' ? 'Joining…' : 'Join now'}
        </button>
        {allowInteractive && (
          <button
            onClick={() => join(true)}
            disabled={!!joining}
            title="Join with your mic and camera"
            className={`${buttonBase} bg-zinc-750 text-gray-300 hover:bg-zinc-700 hover:text-white disabled:opacity-50`}
          >
            <Mic size={iconSize} className="shrink-0" />
            {joining === 'interactive' ? 'Joining…' : 'Speak'}
          </button>
        )}
      </span>
    );
  }

  const location = classifySessionLocation(session.location_or_link);

  if (location.kind === 'none') return <span className="text-gray-500">—</span>;

  if (location.kind === 'place') {
    return (
      <span className={`flex items-center gap-1.5 ${compact ? 'text-xs' : ''}`}>
        <MapPin size={iconSize} className="text-gold shrink-0" />
        <span className="truncate">{location.label}</span>
      </span>
    );
  }

  // A link on a session that is cancelled or over: still shown, because "where
  // was it" stays a real question afterwards, but never as a way in.
  if (!isJoinable(session.status)) {
    return (
      <span className={`flex items-center gap-1.5 text-gray-500 ${compact ? 'text-xs' : ''}`}>
        <Video size={iconSize} className="shrink-0" />
        <span className="truncate line-through">{location.label}</span>
      </span>
    );
  }

  const live = isWithinJoinWindow(session.start_time, session.end_time);

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
          ? `${buttonBase} bg-gold text-black hover:bg-gold-hover`
          : `${buttonBase} bg-zinc-750 text-gray-300 hover:bg-zinc-700 hover:text-white`
      }
    >
      <Video size={iconSize} className="shrink-0" />
      {live ? 'Join now' : 'Open link'}
    </a>
  );
}
