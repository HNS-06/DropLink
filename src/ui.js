/**
 * ui.js — UI helper utilities
 */

window.UI = (() => {

  // ── Toast notifications ───────────────────────────────────
  function toast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    
    let icon = '⬡';
    if (type === 'success') icon = '🛡️'; // Shield for secure success
    if (type === 'error') icon = '🚨'; // Alarm/alert icon
    if (type === 'info') icon = '💡';  // Lightbulb info
    
    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
        <span class="toast-icon" style="font-size: 1.1rem; flex-shrink: 0;">${icon}</span>
        <span class="toast-message" style="word-break: break-word; line-height: 1.4;">${msg}</span>
      </div>
      <button class="toast-close" style="background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.95rem; padding: 4px 6px; margin-left: 6px; transition: color 0.2s;" title="Dismiss">✕</button>
    `;
    
    const closeBtn = el.querySelector('.toast-close');
    const dismiss = () => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(() => el.remove(), 250);
    };
    
    closeBtn.onclick = dismiss;
    closeBtn.onmouseenter = () => { closeBtn.style.color = 'var(--text)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.color = 'var(--muted)'; };
    
    container.appendChild(el);
    
    // Auto dismiss
    setTimeout(() => {
      if (el.parentNode) {
        dismiss();
      }
    }, duration);
  }

  // ── Screen navigation ─────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  // ── Step navigation (within a screen) ────────────────────
  function showStep(id) {
    const step = document.getElementById(id);
    if (!step) return;
    const siblings = step.closest('.panel')?.querySelectorAll('.step') ||
                     step.parentElement.querySelectorAll('.step');
    siblings.forEach(s => s.classList.add('hidden'));
    step.classList.remove('hidden');
  }

  // ── File icon by MIME ─────────────────────────────────────
  function fileIcon(name, mime = '') {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime === 'application/pdf') return '📄';
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
      js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
      py: '🐍', rb: '💎', go: '🐹',
      html: '🌐', css: '🎨',
      doc: '📝', docx: '📝', txt: '📝', md: '📝',
      xls: '📊', xlsx: '📊', csv: '📊',
      exe: '⚙️', dmg: '⚙️', apk: '📱',
      ppt: '📊', pptx: '📊',
      svg: '🎨', psd: '🎨', ai: '🎨',
      json: '📋', xml: '📋', yaml: '📋', yml: '📋',
    };
    return map[ext] || '📁';
  }

  // ── Human readable file size ──────────────────────────────
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ── Format speed ──────────────────────────────────────────
  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
    return formatSize(bytesPerSec) + '/s';
  }

  // ── Format time remaining ─────────────────────────────────
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }

  // ── Render file list item ─────────────────────────────────
  function renderFileItem(file, index, onRemove) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.id = `file-item-${index}`;
    div.innerHTML = `
      <span class="file-icon">${fileIcon(file.name, file.type)}</span>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-size">${formatSize(file.size)}</div>
      </div>
      <button class="file-remove" title="Remove">✕</button>
    `;
    div.querySelector('.file-remove').onclick = () => onRemove(index);
    return div;
  }

  // ── Create/update progress bar ────────────────────────────
  function upsertProgressBar(containerId, id, name, pct, icon = '📁') {
    const container = document.getElementById(containerId);
    let item = document.getElementById(`prog-${id}`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'progress-item';
      item.id = `prog-${id}`;
      item.innerHTML = `
        <div class="progress-top">
          <span style="font-size: 1.15rem;">${icon}</span>
          <span class="progress-name" title="${name}">${name}</span>
          <span class="progress-pct" id="pct-${id}">0%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" id="bar-${id}"></div>
        </div>
      `;
      container.appendChild(item);
    }
    const bar = document.getElementById(`bar-${id}`);
    const pctEl = document.getElementById(`pct-${id}`);
    if (bar) {
      bar.style.width = pct + '%';
      if (pct >= 100) bar.classList.add('done');
    }
    if (pctEl) pctEl.textContent = pct + '%';
  }

  // ── Orb progress ─────────────────────────────────────────
  function updateOrb(pct) {
    const orb = document.getElementById('transfer-orb');
    const circle = document.getElementById('orb-circle');
    const label = document.getElementById('orb-pct');
    if (!orb || !circle) return;
    if (pct > 0 && pct < 100) {
      orb.style.display = 'flex';
    } else {
      orb.style.display = 'none';
    }
    const circumference = 502; // circumference of circle with r=80 (2 * pi * 80)
    const offset = circumference - (pct / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    if (label) label.textContent = pct + '%';
  }

  // ── Simple QR code renderer (pure JS, no library) ─────────
  function renderQR(containerId, text) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=060608&margin=2`;
    img.width = 130;
    img.height = 130;
    img.alt = 'QR Code';
    img.style.borderRadius = '6px';
    wrap.innerHTML = '';
    wrap.appendChild(img);
  }

  // ── Copy to clipboard ─────────────────────────────────────
  async function copyText(text, btnEl) {
    try {
      await navigator.clipboard.writeText(text);
      if (btnEl) {
        btnEl.textContent = '✓ copied';
        btnEl.classList.add('copied');
        setTimeout(() => {
          btnEl.textContent = '⧉ copy';
          btnEl.classList.remove('copied');
        }, 2000);
      }
      return true;
    } catch {
      return false;
    }
  }

  // ── Confetti physics-based explosion ──────────────────────
  function confetti() {
    const colors = ['#e8f54e', '#00f0ff', '#34d399', '#ff4d6a', '#ffffff'];
    const container = document.body;
    
    // Burst 80 colorful physical particles from center screen
    for (let i = 0; i < 80; i++) {
      const el = document.createElement('div');
      const size = Math.random() * 6 + 6;
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 16 + 8;
      
      el.style.cssText = `
        position: fixed;
        width: ${size}px;
        height: ${size}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        z-index: 9999;
        left: 50vw;
        top: 45vh;
        pointer-events: none;
        opacity: 0.9;
        transform: translate(-50%, -50%);
      `;
      container.appendChild(el);
      
      let x = window.innerWidth / 2;
      let y = window.innerHeight * 0.45;
      let vx = Math.cos(angle) * velocity;
      let vy = Math.sin(angle) * velocity - 4; // initial upward push
      const gravity = 0.38;
      const friction = 0.97;
      
      let rot = Math.random() * 360;
      let rotSpeed = (Math.random() - 0.5) * 12;
      let opacity = 1.0;
      
      function update() {
        vy += gravity;
        vx *= friction;
        vy *= friction;
        x += vx;
        y += vy;
        rot += rotSpeed;
        opacity -= 0.012;
        
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
        el.style.opacity = opacity;
        
        if (opacity > 0 && y < window.innerHeight) {
          requestAnimationFrame(update);
        } else {
          el.remove();
        }
      }
      
      requestAnimationFrame(update);
    }
  }

  return {
    toast, showScreen, showStep,
    fileIcon, formatSize, formatSpeed, formatTime,
    renderFileItem, upsertProgressBar,
    updateOrb, renderQR, copyText, confetti,
  };
})();
