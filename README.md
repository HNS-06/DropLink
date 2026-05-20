# ⬡ DropLink — P2P Encrypted File Sharing

> Browser-to-browser file transfer via WebRTC. AES-256 encrypted. No servers, no uploads.

![Tech: WebRTC + AES-256-GCM + Web Crypto API](https://img.shields.io/badge/WebRTC-P2P-brightgreen) ![Encryption: AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-Encrypted-yellow) ![No Server Storage](https://img.shields.io/badge/Storage-None-red)

---

## 🚀 Features

| Feature | Details |
|---|---|
| **P2P Transfer** | Files go directly browser → browser via WebRTC Data Channels |
| **AES-256-GCM Encryption** | Every chunk encrypted client-side before sending |
| **No Upload** | Files never touch a server — zero data retained |
| **Any File Size** | Chunked streaming (64KB chunks) handles large files |
| **QR Code Sharing** | Scan to join from mobile instantly |
| **Multi-file** | Send multiple files in one session |
| **Live Progress** | Per-file progress bars, speed, ETA |
| **Auto Download** | Files auto-save as they complete |
| **Confetti 🎉** | Celebration animation on completion |
| **Keyboard ESC** | Exit any screen with Escape key |
| **URL deep link** | Share `?join=XXXX-XXXX` link for instant join |
| **E2E Integrity Hashing** | SHA-256 E2E integrity check on receiver reassembly |

---

## 📁 Project Structure

```
p2p-fileshare/
├── index.html          # App shell, all screens
├── src/
│   ├── style.css       # Dark industrial design system
│   ├── noise.js        # Animated film grain background
│   ├── crypto.js       # AES-256-GCM encryption + SHA-256 hashing
│   ├── webrtc.js       # WebRTC peer connection + signaling
│   ├── transfer.js     # Chunked transfer protocol
│   ├── ui.js           # UI helpers (toast, progress, QR, confetti)
│   └── app.js          # Main controller / event wiring
└── README.md
```

---

## 🏗️ Architecture

```
Sender Browser                  Receiver Browser
┌─────────────────┐             ┌─────────────────┐
│ 1. Select files │             │ 1. Enter code   │
│ 2. Gen room code│──Signaling──│ 2. Join room    │
│ 3. Wait for peer│  (WS/BC)    │                 │
│ 4. WebRTC offer │────────────▶│ WebRTC answer   │
│                 │◀────────────│                 │
│ ICE candidates  │◀───────────▶│ ICE candidates  │
│                 │             │                 │
│ 5. Encrypt chunk│ Data Channel│ 6. Decrypt chunk│
│    AES-256-GCM  │────────────▶│    AES-256-GCM  │
│    (64KB each)  │             │    Reassemble   │
│                 │             │ 7. E2E Integrity│
│                 │             │    SHA-256 check│
└─────────────────┘             └─────────────────┘
```

### Key Design Decisions

- **Signaling**: Uses a free public WebSocket relay (socketsbay.com) with BroadcastChannel fallback for same-origin tab testing. Replace with your own WebSocket server for production.
- **Encryption key**: Derived via PBKDF2 from the room code. Both peers derive the same key independently — no key exchange needed over the wire.
- **Chunking**: 64KB chunks with backpressure handling (waits for buffer < 16MB before sending next chunk).
- **Protocol**: JSON metadata frames interleaved with binary data packets. Binary packets have an 8-byte header (fileId + chunkIndex).
- **Integrity**: Full SHA-256 checksum calculated before transmission and verified post-reassembly.

---

## ⚡ Quick Start

```bash
# No npm, no build step — just serve the files
npx serve .
# or
python3 -m http.server 8080
# or open index.html directly (BroadcastChannel works for same-tab testing)
```

Then open two browser tabs to `http://localhost:8080`.

---

## 🔒 Security Model

- **AES-256-GCM** with a random 96-bit IV per chunk
- Key derived via **PBKDF2** (100,000 iterations, SHA-256)
- Room code acts as shared secret — never transmitted, only derived from
- WebRTC itself uses **DTLS-SRTP** (mandatory by spec) for transport security
- Files are **never stored** — everything is in-memory ArrayBuffers
- E2E integrity verified client-side using **SHA-256** checksums

> ⚠️ **Note**: The PBKDF2 shared secret approach means the room code IS the encryption key. For production, implement a full **ECDH key exchange** over the signaling channel so even the signaling server can't derive the key.

---

## 🚀 Deploy to Production

### Option A — Static hosting (Netlify/Vercel/GitHub Pages)
Just push the folder. No backend needed for the app itself.

### Option B — Replace signaling server
Edit `webrtc.js` → `connectSignaling()` function:

```javascript
// Replace with your WebSocket server
const wsUrl = `wss://your-server.com/signal/${room}`;
```

**Minimal Node.js signaling server:**
```javascript
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 8080 });
const rooms = {};

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (!rooms[msg.room]) rooms[msg.room] = new Set();
    rooms[msg.room].add(ws);
    rooms[msg.room].forEach(peer => { if (peer !== ws) peer.send(data); });
  });
  ws.on('close', () => Object.values(rooms).forEach(r => r.delete(ws)));
});
```

### Option C — Firebase / Supabase realtime
Replace `sendSignal` / `connectSignaling` with Firestore/Supabase realtime listeners.

---

## 🧠 What to highlight on your resume

- **WebRTC Data Channels** — direct P2P binary streaming with backpressure
- **Web Crypto API** — AES-256-GCM encryption/decryption in the browser
- **PBKDF2 key derivation** — secure key from shared passphrase
- **Custom chunking protocol** — binary framing with metadata + data interleaving
- **Zero-trust architecture** — files never leave user devices
- **Progressive enhancement** — works even with BroadcastChannel (no WS server)

---

## 🛣️ Future Enhancements (stretch goals)

- [ ] ECDH key exchange for perfect forward secrecy
- [ ] Multi-peer rooms (send to multiple receivers)
- [ ] Resume interrupted transfers (chunk acknowledgment)
- [ ] File preview before accepting
- [ ] Transfer history (IndexedDB)
- [ ] CLI client (Node.js + `wrtc` package)
- [ ] Mobile app (Capacitor or Flutter WebRTC)
- [ ] End-to-end integrity check (SHA-256 of full file after transfer)
