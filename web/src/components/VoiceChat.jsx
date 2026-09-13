'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function VoiceChat({ workspaceId, onlineUsers = [] }) {
  const { user } = useAuth();
  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const candidateQueueRef = useRef(new Map());
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You';

  const updateParticipants = useCallback(() => {
    const ids = [user?.id, ...peersRef.current.keys()].filter(Boolean);
    const people = ids.map((id) => {
      if (id === user?.id) return { id, name: displayName, self: true };
      const person = onlineUsers.find((item) => item.userId === id);
      return { id, name: person?.name || 'User', self: false };
    });
    setParticipants(people);
  }, [displayName, onlineUsers, user?.id]);

  const cleanupPeer = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);
    if (peer) peer.close();
    peersRef.current.delete(peerId);
    candidateQueueRef.current.delete(peerId);

    const audio = audioRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    audioRef.current.delete(peerId);
    updateParticipants();
  }, [updateParticipants]);

  const flushCandidates = useCallback(async (peerId, peer) => {
    const queued = candidateQueueRef.current.get(peerId) || [];
    candidateQueueRef.current.delete(peerId);
    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (candidateError) {
        console.error('ICE candidate failed:', candidateError);
      }
    }
  }, []);

  const createPeer = useCallback((peerId) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;

    const channel = channelRef.current;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (!event.candidate || !channel) return;
      channel.send({
        type: 'broadcast',
        event: 'voice-ice',
        payload: { from: user.id, to: peerId, candidate: event.candidate },
      });
    };

    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      let audio = audioRef.current.get(peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute('aria-label', 'Voice participant');
        document.body.appendChild(audio);
        audioRef.current.set(peerId, audio);
      }

      audio.srcObject = stream;
      void audio.play().catch(() => {});
    };

    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        cleanupPeer(peerId);
      }
    };

    peersRef.current.set(peerId, peer);
    updateParticipants();
    return peer;
  }, [cleanupPeer, updateParticipants, user?.id]);

  const callPeer = useCallback(async (peerId) => {
    if (!user || !channelRef.current || !localStreamRef.current) return;

    const peer = createPeer(peerId);
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);

    await channelRef.current.send({
      type: 'broadcast',
      event: 'voice-offer',
      payload: { from: user.id, to: peerId, description: peer.localDescription },
    });
  }, [createPeer, user]);

  const leaveVoice = useCallback(() => {
    channelRef.current?.untrack().catch(() => {});
    if (channelRef.current) {
      getSupabase().removeChannel(channelRef.current);
    }
    channelRef.current = null;

    for (const peerId of [...peersRef.current.keys()]) cleanupPeer(peerId);

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setJoined(false);
    setMuted(false);
    setParticipants([]);
    setStatus('idle');
  }, [cleanupPeer]);

  const joinVoice = useCallback(async () => {
    if (!user || joined) return;

    setError('');
    setStatus('requesting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support microphone access.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      const supabase = getSupabase();
      const channel = supabase.channel(`voice-${workspaceId}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, async () => {
          const state = channel.presenceState();
          const peerIds = Object.keys(state).filter((id) => id !== user.id);
          updateParticipants();

          for (const peerId of peerIds) {
            if (user.id < peerId) {
              try {
                await callPeer(peerId);
              } catch (callError) {
                console.error('Voice offer failed:', callError);
              }
            }
          }
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          if (key !== user.id) cleanupPeer(key);
        })
        .on('broadcast', { event: 'voice-offer' }, async ({ payload }) => {
          if (!payload || payload.to !== user.id) return;

          try {
            const peer = createPeer(payload.from);
            await peer.setRemoteDescription(payload.description);
            await flushCandidates(payload.from, peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            await channel.send({
              type: 'broadcast',
              event: 'voice-answer',
              payload: { from: user.id, to: payload.from, description: peer.localDescription },
            });
          } catch (offerError) {
            console.error('Voice offer handling failed:', offerError);
            setError('A voice connection could not be established with one participant.');
          }
        })
        .on('broadcast', { event: 'voice-answer' }, async ({ payload }) => {
          if (!payload || payload.to !== user.id) return;
          const peer = peersRef.current.get(payload.from);
          if (!peer) return;

          try {
            await peer.setRemoteDescription(payload.description);
            await flushCandidates(payload.from, peer);
          } catch (answerError) {
            console.error('Voice answer handling failed:', answerError);
          }
        })
        .on('broadcast', { event: 'voice-ice' }, async ({ payload }) => {
          if (!payload || payload.to !== user.id || !payload.candidate) return;
          const peer = peersRef.current.get(payload.from);

          if (!peer || !peer.remoteDescription) {
            const queued = candidateQueueRef.current.get(payload.from) || [];
            queued.push(payload.candidate);
            candidateQueueRef.current.set(payload.from, queued);
            return;
          }

          try {
            await peer.addIceCandidate(payload.candidate);
          } catch (candidateError) {
            console.error('ICE candidate handling failed:', candidateError);
          }
        })
        .subscribe(async (channelStatus) => {
          if (channelStatus !== 'SUBSCRIBED') return;

          await channel.track({
            userId: user.id,
            name: displayName,
            voice: true,
          });

          setJoined(true);
          setStatus('connected');
          updateParticipants();
        });
    } catch (joinError) {
      console.error('Voice chat error:', joinError);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (channelRef.current) getSupabase().removeChannel(channelRef.current);
      channelRef.current = null;
      setStatus('idle');
      setError(
        joinError?.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow microphone access and try again.'
          : joinError.message || 'Unable to start voice chat.',
      );
    }
  }, [callPeer, cleanupPeer, createPeer, displayName, flushCandidates, joined, updateParticipants, user, workspaceId]);

  useEffect(() => {
    updateParticipants();
  }, [onlineUsers, updateParticipants]);

  useEffect(() => {
    return () => {
      channelRef.current?.untrack().catch(() => {});
      if (channelRef.current) {
        getSupabase().removeChannel(channelRef.current);
      }
      for (const peer of peersRef.current.values()) peer.close();
      peersRef.current.clear();
      for (const audio of audioRef.current.values()) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      audioRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const statusLabel = useMemo(() => {
    if (status === 'requesting') return 'Starting microphone…';
    if (status === 'connected') return `${participants.length} in voice`;
    return 'Voice chat';
  }, [participants.length, status]);

  return (
    <section className={`voice-chat ${joined ? 'joined' : ''}`}>
      <div className="voice-chat-main">
        <div className="voice-chat-icon">🎙</div>
        <div className="voice-chat-copy">
          <strong>{statusLabel}</strong>
          <span>{joined ? 'Live in this workspace' : 'Talk while you collaborate'}</span>
        </div>
      </div>

      {joined ? (
        <div className="voice-participants" aria-label="Voice participants">
          {participants.map((person) => (
            <span key={person.id} className="voice-person">
              <span className="voice-person-dot" />
              {person.self ? 'You' : person.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="voice-chat-actions">
        {joined ? (
          <>
            <button className={`voice-button ${muted ? 'muted' : ''}`} onClick={toggleMute}>
              {muted ? '🔇 Unmute' : '🎙 Mute'}
            </button>
            <button className="voice-button danger" onClick={leaveVoice}>Leave</button>
          </>
        ) : (
          <button className="voice-button primary" onClick={joinVoice} disabled={status === 'requesting'}>
            {status === 'requesting' ? 'Connecting…' : 'Join voice'}
          </button>
        )}
      </div>

      {error ? <p className="voice-error">{error}</p> : null}
    </section>
  );
}
