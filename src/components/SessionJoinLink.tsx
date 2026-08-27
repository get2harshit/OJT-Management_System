import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Video } from 'lucide-react';
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
  /** Shows "End for everyone" once inside. The server still decides the role. */
  isHost?: boolean;
  /** Name to appear under this person's tile in the room. */
  userName?: string;
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
export default function SessionJoinLink({ session, variant = 'detail', isHost = false, userName }: SessionJoinLinkProps) {
  const { showError } = useToast();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const compact = variant === 'cell';
  const iconSize = compact ? 12 : 14;
  const buttonBase = `inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors ${compact ? 'text-xs px-2.5 py-1' : 'text-xs px-3 py-1.5'}`;

  // Started on the multimedia service and not yet ended.
  //
  // Truthy rather than `!== null`, because a session that has never been
  // started arrives two different ways: null from a backend that knows about
  // hosting, and undefined from one that does not — an older deploy, or a
  // response shaped before this field existed. `undefined !== null` is true,
  // so the strict form offered Join on every session in the list and 404'd on
  // click. Not hosted is not hosted, however it is spelled.
  const hostedLive = !!session.live_session_id && !session.live_ended_at;

  const join = async () => {
    setJoining(true);
    try {
      // Fetched at the moment of joining and never held: the token is
      // short-lived and issued for this person, so a cached one would be
      // expired when it mattered and a shared one would let somebody in as
      // someone else.
      //
      // What this person may do in the room — speak, share, end it — rides on
      // the role baked into the token, which the server decides. There is
      // nothing to ask for from here.
      const { authToken } = await apiGetSessionJoinToken(session.id);
      // Router state, not the URL: a token in a URL ends up in history, logs
      // and pasted messages.
      navigate('/live-session', {
        state: {
          authToken,
          userName: userName || 'Guest',
          sessionId: session.id,
          sessionTitle: session.title ?? undefined,
          isHost,
        },
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not get you into this session');
    } finally {
      setJoining(false);
    }
  };

  if (hostedLive) {
    return (
      <button
        onClick={join}
        disabled={joining}
        title="Join this session"
        className={`${buttonBase} bg-gold text-black hover:bg-gold-hover disabled:opacity-50`}
      >
        <Video size={iconSize} className="shrink-0" />
        {joining ? 'Joining…' : 'Join now'}
      </button>
    );
  }

  const location = classifySessionLocation(session.location_or_link);

  // No pasted link, and not hosted here yet either — say so plainly instead of
  // a bare "—" that reads the same as "there was never going to be a way in".
  if (location.kind === 'none') {
    if (!isJoinable(session.status)) return <span className="text-gray-500">—</span>;
    return (
      <span className={`flex items-center gap-1.5 text-gray-500 ${compact ? 'text-xs' : ''}`}>
        <Clock size={iconSize} className="shrink-0" />
        Not started yet
      </span>
    );
  }

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
