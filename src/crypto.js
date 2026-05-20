/**
 * crypto.js — AES-256-GCM encryption using WebCrypto API
 * Keys are derived from a shared room code + ECDH key exchange simulation.
 * For simplicity in demo: we use a shared passphrase-derived key.
 * In production: do full ECDH over the signaling channel.
 */
window.CryptoHelper = (() => {

  // Derive a 256-bit AES-GCM key from a passphrase (room code)
  async function deriveKey(passphrase) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('droplink-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt an ArrayBuffer, returns { iv, ciphertext } both ArrayBuffers
  async function encrypt(key, arrayBuffer) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      arrayBuffer
    );
    return { iv, ciphertext };
  }

  // Decrypt, returns ArrayBuffer
  async function decrypt(key, iv, ciphertext) {
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext
    );
  }

  // Pack iv + ciphertext into a single ArrayBuffer for transfer
  function pack(iv, ciphertext) {
    const packed = new Uint8Array(12 + ciphertext.byteLength);
    packed.set(new Uint8Array(iv), 0);
    packed.set(new Uint8Array(ciphertext), 12);
    return packed.buffer;
  }

  // Unpack iv (first 12 bytes) and ciphertext (rest)
  function unpack(buffer) {
    const arr = new Uint8Array(buffer);
    return {
      iv: arr.slice(0, 12),
      ciphertext: arr.slice(12).buffer,
    };
  }

  // Compute SHA-256 hash of an ArrayBuffer, returns hex string
  async function hash(arrayBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return { deriveKey, encrypt, decrypt, pack, unpack, hash };
})();
