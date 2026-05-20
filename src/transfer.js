/**
 * transfer.js — File transfer protocol over WebRTC data channel
 *
 * Protocol:
 *   1. Sender sends JSON metadata message:
 *      { type: 'meta', id, name, size, mimeType, totalChunks, hash }
 *   2. Sender streams encrypted chunks:
 *      ArrayBuffer: [4-byte fileId][4-byte chunkIndex][encrypted data]
 *   3. Sender sends JSON done message:
 *      { type: 'done', id }
 *   4. Sender sends all-done:
 *      { type: 'all-done' }
 */

window.TransferManager = (() => {

  const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

  let cryptoKey = null;
  let files = [];               // files queued for sending
  let receiveMap = {};          // fileId -> receive state
  let callbacks = {
    onSendProgress: null,
    onReceiveProgress: null,
    onReceiveFile: null,
    onAllDone: null,
    onSendComplete: null,
    onStats: null,
  };

  // Speed tracking
  let lastBytesAt = 0;
  let lastBytes = 0;
  let statsInterval = null;

  function startStatsTimer(getBytes) {
    clearInterval(statsInterval);
    lastBytesAt = Date.now();
    lastBytes = 0;
    statsInterval = setInterval(() => {
      const now = Date.now();
      const bytes = getBytes();
      const elapsed = (now - lastBytesAt) / 1000;
      const speed = elapsed > 0 ? (bytes - lastBytes) / elapsed : 0;
      lastBytes = bytes;
      lastBytesAt = now;
      callbacks.onStats && callbacks.onStats({ speedBytes: Math.round(speed) });
    }, 800);
  }

  function stopStatsTimer() { clearInterval(statsInterval); statsInterval = null; }

  // ── Sender ───────────────────────────────────────────────
  async function sendFiles(fileArray, key) {
    cryptoKey = key;
    files = Array.from(fileArray);
    let sentBytes = 0;

    startStatsTimer(() => sentBytes);

    for (const file of files) {
      const id = Math.random().toString(36).slice(2, 10);
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Read file buffer once
      const buffer = await file.arrayBuffer();
      
      // Calculate file SHA-256 hash before sending
      let fileHash = '';
      try {
        fileHash = await CryptoHelper.hash(buffer);
      } catch (e) {
        console.error('[Hash] Failed to compute hash', e);
      }

      // Send metadata (including SHA-256 hash)
      const meta = JSON.stringify({
        type: 'meta', id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        totalChunks,
        hash: fileHash,
      });
      WebRTCManager.sendRaw(meta);

      // Stream chunks
      let chunkIndex = 0;

      while (chunkIndex < totalChunks) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const slice = buffer.slice(start, end);

        // Encrypt chunk
        const { iv, ciphertext } = await CryptoHelper.encrypt(cryptoKey, slice);
        const packed = CryptoHelper.pack(iv, ciphertext);

        // Build packet: [8-byte header: fileId(4) + chunkIndex(4)] + encrypted data
        const header = new ArrayBuffer(8);
        const view = new DataView(header);
        // Use first 4 chars of id as int
        const idInt = parseInt(id.slice(0, 4), 36) % 0x7fffffff;
        view.setUint32(0, idInt, false);
        view.setUint32(4, chunkIndex, false);

        const packet = new Uint8Array(8 + packed.byteLength);
        packet.set(new Uint8Array(header), 0);
        packet.set(new Uint8Array(packed), 8);

        await WebRTCManager.sendBuffered(packet.buffer);

        chunkIndex++;
        sentBytes += (end - start);

        const pct = Math.round((chunkIndex / totalChunks) * 100);
        callbacks.onSendProgress && callbacks.onSendProgress(id, pct, file.name);
      }

      // Done signal for this file
      WebRTCManager.sendRaw(JSON.stringify({ type: 'done', id }));
    }

    stopStatsTimer();
    // All files done
    WebRTCManager.sendRaw(JSON.stringify({ type: 'all-done' }));
    callbacks.onSendComplete && callbacks.onSendComplete();
  }

  // ── Receiver ─────────────────────────────────────────────
  function setupReceiver(key) {
    cryptoKey = key;
    receiveMap = {};
    let totalReceived = 0;
    startStatsTimer(() => totalReceived);

    WebRTCManager.on('onMessage', async (data) => {
      if (typeof data === 'string') {
        const msg = JSON.parse(data);

        if (msg.type === 'meta') {
          receiveMap[msg.id] = {
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
            totalChunks: msg.totalChunks,
            chunks: new Array(msg.totalChunks),
            received: 0,
            idInt: parseInt(msg.id.slice(0, 4), 36) % 0x7fffffff,
            id: msg.id,
            hash: msg.hash, // Save hash from metadata
          };
          callbacks.onReceiveProgress && callbacks.onReceiveProgress(msg.id, 0, msg.name, msg.size);
        }

        if (msg.type === 'done') {
          const info = Object.values(receiveMap).find(r => r.id === msg.id);
          if (!info) return;

          // Reassemble
          const parts = info.chunks.map(c => new Uint8Array(c));
          const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
          const assembled = new Uint8Array(totalLen);
          let offset = 0;
          for (const p of parts) { assembled.set(p, offset); offset += p.byteLength; }

          // Integrity check using SHA-256
          let isVerified = false;
          if (info.hash) {
            try {
              const recvHash = await CryptoHelper.hash(assembled.buffer);
              isVerified = (recvHash === info.hash);
              if (isVerified) {
                console.log(`[Integrity] ${info.name} verified successfully.`);
              } else {
                console.warn(`[Integrity] Mismatch for ${info.name}! Metadata hash: ${info.hash}, Reassembled hash: ${recvHash}`);
              }
            } catch (e) {
              console.error('[Integrity] Failed to calculate hash for verification', e);
            }
          } else {
            console.warn('[Integrity] No hash received in metadata for', info.name);
          }

          const blob = new Blob([assembled], { type: info.mimeType || 'application/octet-stream' });
          callbacks.onReceiveFile && callbacks.onReceiveFile(info.id, info.name, blob, info.size, isVerified);
          callbacks.onReceiveProgress && callbacks.onReceiveProgress(info.id, 100, info.name, info.size);
        }

        if (msg.type === 'all-done') {
          stopStatsTimer();
          callbacks.onAllDone && callbacks.onAllDone();
        }

      } else {
        // Binary chunk packet
        const arr = new Uint8Array(data);
        const view = new DataView(data);
        const idInt = view.getUint32(0, false);
        const chunkIndex = view.getUint32(4, false);
        const encData = data.slice(8);

        // Find matching receive buffer
        const info = Object.values(receiveMap).find(r => r.idInt === idInt);
        if (!info) return;

        // Decrypt
        const { iv, ciphertext } = CryptoHelper.unpack(encData);
        let plain;
        try {
          plain = await CryptoHelper.decrypt(cryptoKey, iv, ciphertext);
        } catch (e) {
          console.error('[Decrypt] Failed for chunk', chunkIndex, e);
          return;
        }

        info.chunks[chunkIndex] = plain;
        info.received++;
        totalReceived += plain.byteLength;

        const pct = Math.round((info.received / info.totalChunks) * 100);
        callbacks.onReceiveProgress && callbacks.onReceiveProgress(info.id, pct, info.name, info.size);
      }
    });
  }

  function on(event, cb) { callbacks[event] = cb; }

  return { sendFiles, setupReceiver, on, CHUNK_SIZE };
})();
