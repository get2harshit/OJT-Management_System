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
  type HMSPeer,
} from '@100mslive/react-sdk';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff, Users } from 'lucide-react';
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

/** One peer's video, or their initials when the camera is off. */
function PeerTile({ peer, large = false }: { peer: HMSPeer; large?: boolean }) {
  const { videoRef } = useVideo({ trackId: peer.videoTrack });
  return (
    <div className={`relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 ${large ? 'aspect-video' : 'aspect-video'}`}>
      <video
        ref={videoRef}
        autoPlay
        muted={peer.isLocal}
        playsInline
        className={`h-full w-full object-cover ${peer.videoTrack ? '' : 'hidden'}`}
      />
      {!peer.videoTrack && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-semibold text-gray-300">
            {initials(peer.name)}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-xs text-white truncate max-w-[80%]">
        {peer.name}
        {peer.isLocal && ' (you)'}
      </div>
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

  // join() must fire exactly once. Under StrictMode the effect runs twice, and
  // a second join on the same token puts the room into a state it never
  // recovers from.
  const joinAttempted = useRef(false);
  const connectedRef = useRef(false);
  const leavingSelf = useRef(false);
  const [ended, setEnded] = useState(false);
  const [endingForAll, setEndingForAll] = useState(false);
  const [sharing, setSharing] = useState(false);

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
    if (!state?.authToken || joinAttempted.current) return;
    joinAttempted.current = true;
    hmsActions.join({ authToken: state.authToken, userName: state.userName || 'Guest' }).catch(() => setEnded(true));
    return () => {
      if (connectedRef.current) hmsActions.leave().catch(() => {});
    };
  }, [state?.authToken, state?.userName, hmsActions]);

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
        <p className="text-gray-300">This page is opened by joining a session, not by visiting it directly.</p>
        <button onClick={() => navigate(-1)} className="text-sm px-3 py-2 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700">
          Go back
        </button>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-950">
        <SpinnerSquare size={40} />
        <p className="text-sm text-gray-400">Joining {state.sessionTitle || 'the session'}…</p>
      </div>
    );
  }

  const sharingPeer = sharingPeers[0];
  const others = peers.filter((p) => p.id !== sharingPeer?.id);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">{state.sessionTitle || 'Live session'}</h1>
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Users size={11} />
            {peers.length} {peers.length === 1 ? 'person' : 'people'}
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-4">
        {sharingPeer ? (
          <div className="grid gap-3 lg:grid-cols-[3fr_1fr]">
            <ScreenShareTile peer={sharingPeer} />
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-1 content-start">
              {others.map((peer) => (
                <PeerTile key={peer.id} peer={peer} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-3 ${
              peers.length <= 1 ? 'grid-cols-1 max-w-3xl mx-auto' : peers.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {peers.map((peer) => (
              <PeerTile key={peer.id} peer={peer} large={peers.length === 1} />
            ))}
          </div>
        )}
      </main>

      <footer className="flex items-center justify-center gap-2 px-4 py-3 border-t border-zinc-800 shrink-0 flex-wrap">
        <button
          onClick={() => hmsActions.setLocalAudioEnabled(!audioOn)}
          title={audioOn ? 'Mute' : 'Unmute'}
          className={`p-3 rounded-full transition-colors ${audioOn ? 'bg-zinc-800 text-white hover:bg-zinc-750' : 'bg-red-500 text-white hover:bg-red-600'}`}
        >
          {audioOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={() => hmsActions.setLocalVideoEnabled(!videoOn)}
          title={videoOn ? 'Turn camera off' : 'Turn camera on'}
          className={`p-3 rounded-full transition-colors ${videoOn ? 'bg-zinc-800 text-white hover:bg-zinc-750' : 'bg-red-500 text-white hover:bg-red-600'}`}
        >
          {videoOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          onClick={toggleShare}
          title={sharing ? 'Stop sharing' : 'Share your screen'}
          className={`p-3 rounded-full transition-colors ${sharing ? 'bg-gold text-black hover:bg-gold-hover' : 'bg-zinc-800 text-white hover:bg-zinc-750'}`}
        >
          {sharing ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
        </button>

        <button
          onClick={leave}
          className="flex items-center gap-1.5 text-xs px-4 py-3 rounded-full bg-zinc-800 text-gray-300 font-semibold hover:bg-zinc-750 transition-colors"
        >
          <PhoneOff size={16} />
          Leave
        </button>

        {/* Only a host sees this, and it is worded as what it does: everyone
            else is dropped, not just the person clicking. */}
        {state.isHost && (
          <button
            onClick={endForAll}
            disabled={endingForAll}
            className="flex items-center gap-1.5 text-xs px-4 py-3 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            <PhoneOff size={16} />
            {endingForAll ? 'Ending…' : 'End for everyone'}
          </button>
        )}

        {localPeer && <span className="sr-only">Joined as {localPeer.name}</span>}
      </footer>
    </div>
  );
}
