import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useHMSActions,
  useHMSStore,
  useHMSNotifications,
  useVideo,
  HMSNotificationTypes,
  selectIsConnectedToRoom,
  selectPeers,
  selectLocalPeer,
  selectIsLocalAudioEnabled,
  selectIsLocalVideoEnabled,
  selectPeersScreenSharing,
  selectScreenShareByPeerID,
  selectDominantSpeaker,
  selectIsPeerAudioEnabled,
  selectIsPeerVideoEnabled,
  selectRoomStartTime,
  type HMSPeer,
} from '@100mslive/react-sdk';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff, Users, X } from 'lucide-react';
import SpinnerSquare from '../components/SpinnerSquare';
import { apiEndLiveSession } from '../lib/api';
import { useToast } from '../toast';

/**
 * What the browser hands this page when it navigates here. The token is passed
 * in router state rather than put in the URL: it is a credential, and a URL is
 * the one place a credential reliably ends up in history, logs and pasted
 * messages.
 */
export interface LiveRoomState {
  authToken: string;
  userName: string;
  sessionId: string;
  sessionTitle?: string;
  /** Only a host is offered "End for everyone". */
  isHost?: boolean;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * The elapsed-time readout, isolated so its own once-a-second tick only
 * re-renders this line — not the whole room. It used to live as state on
 * LiveSessionRoom itself, which meant every peer tile, video element and
 * mute icon re-rendered on the same clock as this text, for the entire call.
 */
function LiveTimer({ roomStartTime }: { roomStartTime: Date }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - roomStartTime.getTime()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [roomStartTime]);
  return <p className="text-xs text-gray-500 tabular-nums">{formatElapsed(elapsedSeconds)}</p>;
}

/** Grid columns tuned so the tiles stay reasonably large instead of just packing more per row. */
function galleryColumns(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-3xl mx-auto';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 9) return 'grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-3 lg:grid-cols-4';
}

/** One peer's video, or their initials when the camera is off. Highlights while they're the one speaking. */
function PeerTile({ peer, isSpeaking = false }: { peer: HMSPeer; isSpeaking?: boolean }) {
  const { videoRef } = useVideo({ trackId: peer.videoTrack });
  const audioEnabled = useHMSStore(selectIsPeerAudioEnabled(peer.id));
  const videoEnabled = useHMSStore(selectIsPeerVideoEnabled(peer.id));
  const showsVideo = videoEnabled && !!peer.videoTrack;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-zinc-900 border aspect-video transition-colors ${
        isSpeaking ? 'border-gold ring-2 ring-gold/70' : 'border-zinc-800'
      }`}
    >
      <video ref={videoRef} autoPlay muted={peer.isLocal} playsInline className={`h-full w-full object-cover ${showsVideo ? '' : 'hidden'}`} />
      {!showsVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
          <div className="h-16 w-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-semibold text-gray-300">
            {initials(peer.name)}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/65 backdrop-blur-sm text-xs text-white max-w-[85%]">
        {audioEnabled ? <Mic size={11} className="text-emerald-400 shrink-0" /> : <MicOff size={11} className="text-red-400 shrink-0" />}
        <span className="truncate">
          {peer.name}
          {peer.isLocal && ' (you)'}
        </span>
      </div>
    </div>
  );
}

/** The local peer's own tile, floated as a small corner picture-in-picture over the gallery — same convention Meet uses for self-view. */
function SelfViewPip({ peer, isSpeaking }: { peer: HMSPeer; isSpeaking: boolean }) {
  return (
    <div className="absolute bottom-4 right-4 w-32 sm:w-44 shadow-2xl shadow-black/60 z-10">
      <PeerTile peer={peer} isSpeaking={isSpeaking} />
    </div>
  );
}

/** Whoever is sharing, shown large with everyone else beside them. */
function ScreenShareTile({ peer }: { peer: HMSPeer }) {
  const screenTrack = useHMSStore(selectScreenShareByPeerID(peer.id));
  const { videoRef } = useVideo({ trackId: screenTrack?.id });
  return (
    <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800 aspect-video">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-xs text-white">
        {peer.name} is sharing
      </div>
    </div>
  );
}

/** A round control-bar button with a small caption underneath — the Meet/Zoom convention, not just a bare icon. */
function ControlButton({
  onClick,
  active,
  danger,
  icon,
  label,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const tone = danger
    ? 'bg-red-500 text-white hover:bg-red-600'
    : active
    ? 'bg-zinc-800 text-white hover:bg-zinc-750'
    : 'bg-red-500/90 text-white hover:bg-red-500';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex flex-col items-center gap-1 disabled:opacity-50"
    >
      <span className={`p-3 rounded-full transition-colors ${tone}`}>{icon}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </button>
  );
}

/**
 * The room itself.
 *
 * Reached only by navigating here with a token already in hand — this page
 * never asks for one. Getting the token is the caller's job because that is
 * where the session being joined is known, and it keeps the room a dumb
 * consumer of "here is a token, go".
 */
export default function LiveSessionRoom() {
  const location = useLocation();
  const navigate = useNavigate();
  const hmsActions = useHMSActions();
  const { showError } = useToast();

  const state = location.state as LiveRoomState | null;

  const isConnected = useHMSStore(selectIsConnectedToRoom);
  const peers = useHMSStore(selectPeers);
  const localPeer = useHMSStore(selectLocalPeer);
  const audioOn = useHMSStore(selectIsLocalAudioEnabled);
  const videoOn = useHMSStore(selectIsLocalVideoEnabled);
  const sharingPeers = useHMSStore(selectPeersScreenSharing);
  const dominantSpeaker = useHMSStore(selectDominantSpeaker);
  const roomStartTime = useHMSStore(selectRoomStartTime);

  // join() must fire exactly once. Under StrictMode the effect runs twice, and
  // a second join on the same token puts the room into a state it never
  // recovers from.
  const joinAttempted = useRef(false);
  const leaveTimeoutRef = useRef<number | null>(null);
  const connectedRef = useRef(false);
  const leavingSelf = useRef(false);
  const [ended, setEnded] = useState(false);
  const [endingForAll, setEndingForAll] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  useEffect(() => {
    connectedRef.current = !!isConnected;
  }, [isConnected]);

  // The room closing is not an error — the host ended it, or we were removed.
  // Without this the page sits on "Connecting…" forever after an "End for all".
  const notification = useHMSNotifications([
    HMSNotificationTypes.ROOM_ENDED,
    HMSNotificationTypes.REMOVED_FROM_ROOM,
    HMSNotificationTypes.ERROR,
  ]);
  useEffect(() => {
    if (!notification || leavingSelf.current) return;
    if (notification.type === HMSNotificationTypes.ERROR) {
      // Joining a room that no longer exists is terminal — same ended screen.
      if ((notification.data as { isTerminal?: boolean })?.isTerminal) setEnded(true);
      return;
    }
    setEnded(true);
  }, [notification]);

  useEffect(() => {
    if (!state?.authToken) return;
    // StrictMode's synthetic mount→cleanup→mount runs synchronously in one
    // tick. A real leave from the first cleanup would race the still-running
    // join and corrupt the SDK's local-peer state before it ever attaches a
    // track (the room opened with mic/camera granted but nothing rendered).
    // Deferring the leave and cancelling it if a remount follows immediately
    // tells the two apart; only a genuine unmount leaves nothing to cancel.
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (!joinAttempted.current) {
      joinAttempted.current = true;
      hmsActions.join({ authToken: state.authToken, userName: state.userName || 'Guest' }).catch(() => setEnded(true));
    }
    return () => {
      if (connectedRef.current) {
        leaveTimeoutRef.current = window.setTimeout(() => {
          leaveTimeoutRef.current = null;
          hmsActions.leave().catch(() => {});
        }, 0);
      }
    };
    // hmsActions deliberately left out of the dependency list: the join/leave
    // pair above is guarded by joinAttempted, not by this effect re-running,
    // and the SDK re-renders the provider tree constantly once connected
    // (every ICE candidate, every track, every peer's mic toggle). Depending
    // on hmsActions meant each of those re-renders was a candidate to refire
    // this effect — cleanup scheduling a real leave() a moment after a real
    // join(), which is indistinguishable from a genuine hang-up. Reproduced
    // by hand: adding the room's participant list (several more per-peer
    // store subscriptions) made a call self-disconnect within a couple of
    // seconds of joining, every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.authToken, state?.userName]);

  const leave = useCallback(async () => {
    leavingSelf.current = true;
    await hmsActions.leave().catch(() => {});
    navigate(-1);
  }, [hmsActions, navigate]);

  const endForAll = useCallback(async () => {
    if (!state?.sessionId) return;
    setEndingForAll(true);
    leavingSelf.current = true;
    try {
      // Our backend closes the room and marks the session ended; leaving alone
      // would drop the host out while everyone else carried on without them.
      await apiEndLiveSession(state.sessionId);
      await hmsActions.leave().catch(() => {});
      navigate(-1);
    } catch (err) {
      leavingSelf.current = false;
      showError(err instanceof Error ? err.message : 'Failed to end the session');
    } finally {
      setEndingForAll(false);
    }
  }, [state?.sessionId, hmsActions, navigate, showError]);

  const toggleShare = useCallback(async () => {
    try {
      await hmsActions.setScreenShareEnabled(!sharing);
      setSharing((s) => !s);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not share your screen');
    }
  }, [hmsActions, sharing, showError]);

  if (!state?.authToken) {
    return (
      <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
        <p className="text-gray-300">This page is opened by joining a session, not by visiting it directly.</p>
        <button onClick={() => navigate(-1)} className="text-sm px-3 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700">
          Go back
        </button>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
        <h1 className="text-xl font-semibold text-white">This session has ended</h1>
        <p className="text-sm text-gray-500">{state.sessionTitle || 'The room is closed.'}</p>
        <button onClick={() => navigate(-1)} className="mt-2 text-sm px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover">
          Back to sessions
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-4 bg-zinc-950">
        <SpinnerSquare size={40} />
        <p className="text-sm text-gray-400">Joining {state.sessionTitle || 'the session'}…</p>
      </div>
    );
  }

  const sharingPeer = sharingPeers[0];
  const remotePeers = peers.filter((p) => !p.isLocal);
  const othersDuringShare = peers.filter((p) => p.id !== sharingPeer?.id);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-zinc-950">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="min-w-0 flex items-center gap-3">
          <span className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[11px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            Live
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">{state.sessionTitle || 'Live session'}</h1>
            {roomStartTime && <LiveTimer roomStartTime={roomStartTime} />}
          </div>
        </div>
        <button
          onClick={() => setShowParticipants((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors shrink-0 ${
            showParticipants ? 'bg-gold text-black' : 'bg-zinc-800 text-gray-300 hover:bg-zinc-750'
          }`}
        >
          <Users size={13} />
          {peers.length} {peers.length === 1 ? 'person' : 'people'}
        </button>
      </header>

      <div className="relative flex-1 min-h-0 flex">
        <main className="relative flex-1 min-h-0 overflow-y-auto p-4">
          {sharingPeer ? (
            <div className="grid gap-3 lg:grid-cols-[3fr_1fr] h-full">
              <ScreenShareTile peer={sharingPeer} />
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-1 content-start">
                {othersDuringShare.map((peer) => (
                  <PeerTile key={peer.id} peer={peer} isSpeaking={dominantSpeaker?.id === peer.id} />
                ))}
              </div>
            </div>
          ) : remotePeers.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-w-2xl">{localPeer && <PeerTile peer={localPeer} />}</div>
            </div>
          ) : (
            <>
              <div className={`grid gap-3 content-start ${galleryColumns(remotePeers.length)}`}>
                {remotePeers.map((peer) => (
                  <PeerTile key={peer.id} peer={peer} isSpeaking={dominantSpeaker?.id === peer.id} />
                ))}
              </div>
              {localPeer && <SelfViewPip peer={localPeer} isSpeaking={dominantSpeaker?.id === localPeer.id} />}
            </>
          )}
        </main>

        {showParticipants && (
          <aside className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-925 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
              <p className="text-xs font-semibold text-gray-300">In this session ({peers.length})</p>
              <button onClick={() => setShowParticipants(false)} className="text-gray-500 hover:text-gray-300">
                <X size={14} />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto p-2 space-y-1">
              {peers.map((peer) => (
                <ParticipantRow key={peer.id} peer={peer} />
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-center gap-3 sm:gap-5 px-4 py-3 border-t border-zinc-800 shrink-0">
        <ControlButton
          onClick={() => hmsActions.setLocalAudioEnabled(!audioOn)}
          active={audioOn}
          icon={audioOn ? <Mic size={18} /> : <MicOff size={18} />}
          label={audioOn ? 'Mute' : 'Unmute'}
        />
        <ControlButton
          onClick={() => hmsActions.setLocalVideoEnabled(!videoOn)}
          active={videoOn}
          icon={videoOn ? <Video size={18} /> : <VideoOff size={18} />}
          label={videoOn ? 'Stop video' : 'Start video'}
        />
        <ControlButton
          onClick={toggleShare}
          active={!sharing}
          icon={sharing ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
          label={sharing ? 'Stop sharing' : 'Share screen'}
        />
        <ControlButton onClick={leave} active icon={<PhoneOff size={18} />} label="Leave" />
        {/* Only a host sees this, and it is worded as what it does: everyone
            else is dropped, not just the person clicking. */}
        {state.isHost && (
          <ControlButton
            onClick={endForAll}
            disabled={endingForAll}
            danger
            icon={<PhoneOff size={18} />}
            label={endingForAll ? 'Ending…' : 'End for all'}
          />
        )}
      </footer>
    </div>
  );
}

function ParticipantRow({ peer }: { peer: HMSPeer }) {
  const audioEnabled = useHMSStore(selectIsPeerAudioEnabled(peer.id));
  const videoEnabled = useHMSStore(selectIsPeerVideoEnabled(peer.id));
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-850">
      <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-semibold text-gray-300 shrink-0">
        {initials(peer.name)}
      </div>
      <span className="flex-1 min-w-0 text-xs text-gray-300 truncate">
        {peer.name}
        {peer.isLocal && ' (you)'}
      </span>
      {audioEnabled ? <Mic size={12} className="text-emerald-400 shrink-0" /> : <MicOff size={12} className="text-gray-600 shrink-0" />}
      {videoEnabled ? <Video size={12} className="text-emerald-400 shrink-0" /> : <VideoOff size={12} className="text-gray-600 shrink-0" />}
    </li>
  );
}
