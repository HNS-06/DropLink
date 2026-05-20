/**
 * app.js — Main application controller
 * Wires WebRTCManager + TransferManager + CryptoHelper + UI together
 */

(async function () {

  // ── State ─────────────────────────────────────────────────
  let selectedFiles = [];
  let cryptoKey = null;
  let roomCode = null;
  let receivedFiles = [];
  let sendTotalBytes = 0;

  // ── DOM refs ──────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Screen routing ────────────────────────────────────────
  $('btn-send').onclick = () => UI.showScreen('screen-send');
  
  $('btn-receive').onclick = () => {
    UI.showScreen('screen-receive');
    // Auto-focus the first code character input
    setTimeout(() => {
      const inputs = document.querySelectorAll('.code-char');
      if (inputs.length > 0) inputs[0].focus();
    }, 150);
  };
  
  $('back-from-send').onclick = () => {
    WebRTCManager.close();
    resetSend();
    UI.showScreen('screen-home');
  };
  $('back-from-receive').onclick = () => {
    WebRTCManager.close();
    resetReceive();
    UI.showScreen('screen-home');
  };

  // ── Drop Zone ─────────────────────────────────────────────
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');

  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = () => addFiles(fileInput.files);

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  };

  function addFiles(newFiles) {
    for (const f of newFiles) {
      if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
        selectedFiles.push(f);
      }
    }
    renderFileList();
  }

  function renderFileList() {
    const list = $('file-list');
    const btn = $('btn-connect-send');
    list.innerHTML = '';
    if (selectedFiles.length === 0) {
      list.classList.add('hidden');
      btn.classList.add('hidden');
      return;
    }
    list.classList.remove('hidden');
    btn.classList.remove('hidden');
    selectedFiles.forEach((f, i) => {
      const item = UI.renderFileItem(f, i, removeFile);
      list.appendChild(item);
    });
    sendTotalBytes = selectedFiles.reduce((s, f) => s + f.size, 0);
    $('send-total').textContent = UI.formatSize(sendTotalBytes);
  }

  function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
  }

  // ── Generate Room & Start Signaling (Sender) ───────────────
  $('btn-connect-send').onclick = async () => {
    if (selectedFiles.length === 0) { UI.toast('Add files first', 'error'); return; }

    try {
      roomCode = WebRTCManager.generateRoomCode();
      cryptoKey = await CryptoHelper.deriveKey(roomCode);

      $('room-code-display').textContent = roomCode;
      UI.showStep('step-share');

      // Render QR with a shareable URL
      const shareUrl = `${location.origin}${location.pathname}?join=${roomCode}`;
      UI.renderQR('qr-wrap', shareUrl);

      // Set up WebRTC
      WebRTCManager.on('onConnected', onSenderConnected);
      WebRTCManager.on('onDisconnected', () => {
        UI.toast('Connection closed by peer', 'error');
        resetSend();
      });
      WebRTCManager.on('onDataChannelOpen', onDataChannelOpenSender);
      await WebRTCManager.initSender(roomCode);

      UI.toast('Room created. Waiting for receiver…', 'info');
    } catch (err) {
      console.error('[Sender] Init failed', err);
      UI.toast('Failed to initialize connection', 'error');
      resetSend();
    }
  };

  $('copy-code').onclick = () => {
    UI.copyText(roomCode, $('copy-code'));
  };

  function onSenderConnected() {
    UI.toast('Receiver connected! Starting E2E transfer…', 'success');
  }

  async function onDataChannelOpenSender() {
    UI.showStep('step-transfer-send');
    $('send-total').textContent = UI.formatSize(sendTotalBytes);

    // Track overall progress
    const progMap = {};
    let overallPct = 0;

    TransferManager.on('onSendProgress', (id, pct, name) => {
      const icon = UI.fileIcon(name, '');
      UI.upsertProgressBar('send-progress-list', id, name, pct, icon);
      progMap[id] = pct;
      overallPct = Math.round(Object.values(progMap).reduce((a, b) => a + b, 0) / selectedFiles.length);
      UI.updateOrb(overallPct);
    });

    TransferManager.on('onStats', ({ speedBytes }) => {
      $('send-speed').textContent = UI.formatSpeed(speedBytes);
      const remaining = speedBytes > 0 ? (sendTotalBytes - (overallPct / 100 * sendTotalBytes)) / speedBytes : 0;
      $('send-time').textContent = UI.formatTime(remaining);
    });

    TransferManager.on('onSendComplete', () => {
      UI.updateOrb(0);
      UI.confetti();
      setTimeout(() => UI.showStep('step-send-done'), 600);
    });

    await TransferManager.sendFiles(selectedFiles, cryptoKey);
  }

  $('btn-send-again').onclick = () => {
    resetSend();
    UI.showStep('step-drop');
  };

  // ── Receive Flow ──────────────────────────────────────────
  // Pre-fill code from URL param
  const urlParams = new URLSearchParams(location.search);
  const joinCode = urlParams.get('join');
  if (joinCode) {
    UI.showScreen('screen-receive');
    const clean = joinCode.replace('-', '').toUpperCase();
    const inputs = document.querySelectorAll('.code-char');
    clean.split('').forEach((ch, i) => {
      if (inputs[i]) inputs[i].value = ch;
    });
    UI.toast('Link sharing code pre-filled!', 'success');
    
    // Auto-trigger connection after minor delay to show UI loading
    setTimeout(() => {
      $('btn-join').click();
    }, 800);
  }

  // Code input auto-advance, paste parsing, and keyboard arrows
  const codeInputs = document.querySelectorAll('.code-char');
  codeInputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value && idx < codeInputs.length - 1) {
        codeInputs[idx + 1].focus();
      }
      
      // Auto trigger submit when all inputs are filled
      if (getEnteredCode().length === 8) {
        $('btn-join').click();
      }
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        codeInputs[idx - 1].value = '';
        codeInputs[idx - 1].focus();
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        codeInputs[idx - 1].focus();
      } else if (e.key === 'ArrowRight' && idx < codeInputs.length - 1) {
        codeInputs[idx + 1].focus();
      }
    });
    
    input.addEventListener('paste', (e) => {
      const paste = (e.clipboardData.getData('text') || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      paste.split('').forEach((ch, i) => {
        if (codeInputs[i + idx]) codeInputs[i + idx].value = ch;
      });
      e.preventDefault();
      
      // Focus last pasted or next empty input
      const nextFocusIdx = Math.min(idx + paste.length, codeInputs.length - 1);
      codeInputs[nextFocusIdx].focus();
      
      // Auto trigger if full code is entered
      if (getEnteredCode().length === 8) {
        $('btn-join').click();
      }
    });
  });

  function getEnteredCode() {
    return Array.from(codeInputs).map(i => i.value.toUpperCase()).join('');
  }

  function triggerCodeEntryShake() {
    const wrap = $('code-inputs');
    if (wrap) {
      wrap.classList.add('shake');
      setTimeout(() => wrap.classList.remove('shake'), 400);
    }
  }

  $('btn-join').onclick = async () => {
    const raw = getEnteredCode();
    if (raw.length < 8) { 
      UI.toast('Enter the full 8-passcode characters', 'error'); 
      triggerCodeEntryShake();
      return; 
    }

    const code = raw.slice(0, 4) + '-' + raw.slice(4);
    
    try {
      cryptoKey = await CryptoHelper.deriveKey(code);
      roomCode = code;

      UI.showStep('step-connecting');
      UI.toast('Connecting to sender…', 'info');

      WebRTCManager.on('onConnected', () => UI.toast('Connected to sender!', 'success'));
      WebRTCManager.on('onDataChannelOpen', onDataChannelOpenReceiver);
      WebRTCManager.on('onDisconnected', () => {
        UI.toast('Connection closed', 'info');
        resetReceive();
        UI.showScreen('screen-home');
      });

      await WebRTCManager.initReceiver(code);
    } catch (err) {
      console.error('[Receiver] Connection setup failed', err);
      UI.toast('Could not establish signaling connection', 'error');
      triggerCodeEntryShake();
      resetReceive();
    }
  };

  function onDataChannelOpenReceiver() {
    receivedFiles = [];
    UI.showStep('step-transfer-receive');

    let recvTotalBytes = 0;
    let recvFileCount = 0;

    TransferManager.on('onReceiveProgress', (id, pct, name, size) => {
      UI.upsertProgressBar('receive-progress-list', id, name, pct, UI.fileIcon(name));
      UI.updateOrb(pct);
    });

    TransferManager.on('onReceiveFile', (id, name, blob, size, isVerified) => {
      recvTotalBytes += size;
      recvFileCount++;
      receivedFiles.push({ id, name, blob, size, isVerified });
      $('recv-total').textContent = UI.formatSize(recvTotalBytes);
      $('recv-files').textContent = recvFileCount;
      
      if (isVerified) {
        UI.toast(`Successfully verified and received ${name}`, 'success');
      } else {
        UI.toast(`Received ${name} (integrity unverified)`, 'info');
      }
      
      // Trigger download immediately
      triggerDownload(name, blob);
    });

    TransferManager.on('onStats', ({ speedBytes }) => {
      $('recv-speed').textContent = UI.formatSpeed(speedBytes);
    });

    TransferManager.on('onAllDone', () => {
      UI.updateOrb(0);
      UI.confetti();
      renderReceivedDone();
      setTimeout(() => UI.showStep('step-receive-done'), 500);
    });

    TransferManager.setupReceiver(cryptoKey);
  }

  function triggerDownload(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function renderReceivedDone() {
    const list = $('received-files-list');
    list.innerHTML = '';
    receivedFiles.forEach(({ name, blob, size, isVerified }) => {
      const url = URL.createObjectURL(blob);
      const div = document.createElement('div');
      div.className = 'received-item';
      
      const shieldHtml = isVerified 
        ? `<span class="integrity-shield" title="E2E SHA-256 Integrity Verified">🛡️</span>` 
        : ``;
      
      div.innerHTML = `
        <span style="font-size:1.15rem;">${UI.fileIcon(name)}</span>
        <a href="${url}" download="${name}">${name}</a>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${shieldHtml}
          <span class="recv-size">${UI.formatSize(size)}</span>
        </div>
      `;
      list.appendChild(div);
    });
  }

  $('btn-receive-again').onclick = () => {
    resetReceive();
    UI.showStep('step-enter-code');
  };

  // ── Reset helpers ─────────────────────────────────────────
  function resetSend() {
    selectedFiles = [];
    cryptoKey = null;
    roomCode = null;
    renderFileList();
    $('send-progress-list').innerHTML = '';
    $('send-speed').textContent = '0 B/s';
    $('send-total').textContent = '0 B';
    $('send-time').textContent = '--';
    UI.showStep('step-drop');
    WebRTCManager.close();
  }

  function resetReceive() {
    cryptoKey = null;
    roomCode = null;
    receivedFiles = [];
    codeInputs.forEach(i => i.value = '');
    $('receive-progress-list').innerHTML = '';
    $('received-files-list').innerHTML = '';
    $('recv-speed').textContent = '0 B/s';
    $('recv-total').textContent = '0 B';
    $('recv-files').textContent = '0';
    UI.showStep('step-enter-code');
    WebRTCManager.close();
  }

  // ── Global keyboard shortcuts ─────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const active = document.querySelector('.screen.active');
      if (active && active.id !== 'screen-home') {
        WebRTCManager.close();
        if (active.id === 'screen-send') resetSend();
        else resetReceive();
        UI.showScreen('screen-home');
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────
  console.log('%cDropLink P2P', 'color:#e8f54e;font-size:1.5rem;font-weight:bold;');
  console.log('%cE2E Encrypted WebRTC File Sharing — Verified & Optimized', 'color:#888');

  // ── Service Worker Registration ───────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('[PWA] Service Worker registered with scope:', reg.scope))
        .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
    });
  }

})();
