/**
 * webrtc.js — WebRTC peer connection + signaling
 *
 * Signaling strategy: We use a lightweight public signaling approach.
 * In a real deployment: replace SignalingChannel with your WebSocket server
 * or a free service like PeerJS server / Firebase Realtime DB.
 *
 * Here we implement a clean abstraction so you can swap backends easily.
 */

window.WebRTCManager = (() => {

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  let pc = null;            // RTCPeerConnection
  let dataChannel = null;   // RTCDataChannel
  let signalingWs = null;   // WebSocket to signaling server
  let roomId = null;
  let role = null;          // 'sender' | 'receiver'
  let iceQueue = [];        // Queue ICE candidates arriving before remote description is set

  // Callbacks
  const callbacks = {
    onConnected: null,
    onDisconnected: null,
    onMessage: null,
    onDataChannelOpen: null,
    onIceCandidate: null,
  };

  // ── Signaling via public WebSocket relay ──────────────────
  function connectSignaling(room, onMessage) {
    const wsUrl = `wss://socketsbay.com/wss/v2/1/${room}/`;
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log('[WS] Signaling connected');
        setStatus('connecting');
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          onMessage(msg);
        } catch (_) {}
      };
      ws.onerror = () => {
        console.warn('[WS] Signaling failed, using BroadcastChannel fallback');
        ws.close();
        connectBroadcast(room, onMessage);
      };
      ws.onclose = () => { console.log('[WS] Signaling closed'); };
      signalingWs = ws;
    } catch (_) {
      connectBroadcast(room, onMessage);
    }
  }

  let bc = null;
  function connectBroadcast(room, onMessage) {
    bc = new BroadcastChannel(`droplink-${room}`);
    bc.onmessage = (e) => onMessage(e.data);
    console.log('[BC] BroadcastChannel fallback active (same-origin only)');
    setStatus('connecting');
  }

  function sendSignal(msg) {
    const data = JSON.stringify(msg);
    if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(data);
    } else if (bc) {
      bc.postMessage(msg);
    }
  }

  // ── Status helper ─────────────────────────────────────────
  function setStatus(s) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if (!dot || !txt) return;
    dot.className = 'status-dot ' + (s || '');
    txt.textContent = s === 'online' ? 'connected' : s === 'connecting' ? 'connecting…' : 'offline';
  }

  // ── Create RTCPeerConnection ──────────────────────────────
  function createPeerConnection() {
    if (pc) { pc.close(); }
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    iceQueue = [];

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: 'ice', candidate: e.candidate, room: roomId });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[RTC] Connection state:', state);
      if (state === 'connected') {
        setStatus('online');
        callbacks.onConnected && callbacks.onConnected();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setStatus('');
        callbacks.onDisconnected && callbacks.onDisconnected();
      }
    };

    pc.ondatachannel = (e) => {
      setupDataChannel(e.channel);
    };

    return pc;
  }

  function setupDataChannel(ch) {
    dataChannel = ch;
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = () => {
      console.log('[DC] Data channel open');
      callbacks.onDataChannelOpen && callbacks.onDataChannelOpen();
    };
    dataChannel.onmessage = (e) => {
      callbacks.onMessage && callbacks.onMessage(e.data);
    };
    dataChannel.onclose = () => {
      console.log('[DC] Data channel closed');
    };
  }

  // Helper to process queued ICE candidates once remote description is set
  async function processQueuedIceCandidates() {
    console.log(`[RTC] Processing ${iceQueue.length} queued ICE candidates`);
    while (iceQueue.length > 0) {
      const candidate = iceQueue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[RTC] Failed to add queued ICE candidate', e);
      }
    }
  }

  // ── Sender flow ───────────────────────────────────────────
  async function initSender(room) {
    roomId = room;
    role = 'sender';

    createPeerConnection();

    connectSignaling(room, async (msg) => {
      if (msg.room !== room) return;

      if (msg.type === 'join') {
        // Receiver joined — create offer
        const ch = pc.createDataChannel('files', { ordered: true });
        setupDataChannel(ch);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer, room });
      }

      if (msg.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await processQueuedIceCandidates();
        }
      }

      if (msg.type === 'ice') {
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (_) {}
        } else {
          iceQueue.push(msg.candidate);
        }
      }
    });

    // Signal that room is ready
    sendSignal({ type: 'ready', room });
  }

  // ── Receiver flow ─────────────────────────────────────────
  async function initReceiver(room) {
    roomId = room;
    role = 'receiver';

    createPeerConnection();

    connectSignaling(room, async (msg) => {
      if (msg.room !== room) return;

      if (msg.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await processQueuedIceCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: answer, room });
      }

      if (msg.type === 'ice') {
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (_) {}
        } else {
          iceQueue.push(msg.candidate);
        }
      }
    });

    // Tell sender we've joined
    sendSignal({ type: 'join', room });
  }

  // ── Send raw data ─────────────────────────────────────────
  function sendRaw(data) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('[DC] Channel not open');
      return;
    }
    dataChannel.send(data);
  }

  // ── Send with backpressure ────────────────────────────────
  function sendBuffered(data) {
    return new Promise((resolve) => {
      function trySend() {
        if (dataChannel.bufferedAmount < 16 * 1024 * 1024) {
          dataChannel.send(data);
          resolve();
        } else {
          setTimeout(trySend, 30);
        }
      }
      trySend();
    });
  }

  // ── Close ─────────────────────────────────────────────────
  function close() {
    if (dataChannel) { dataChannel.close(); dataChannel = null; }
    if (pc) { pc.close(); pc = null; }
    if (signalingWs) { signalingWs.close(); signalingWs = null; }
    if (bc) { bc.close(); bc = null; }
    setStatus('');
  }

  // ── Generate room code ────────────────────────────────────
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const rand = crypto.getRandomValues(new Uint8Array(8));
    rand.forEach(b => { code += chars[b % chars.length]; });
    return code.slice(0, 4) + '-' + code.slice(4);
  }

  return {
    initSender,
    initReceiver,
    sendRaw,
    sendBuffered,
    close,
    generateRoomCode,
    on(event, cb) { callbacks[event] = cb; },
    get isOpen() { return dataChannel && dataChannel.readyState === 'open'; },
  };
})();
