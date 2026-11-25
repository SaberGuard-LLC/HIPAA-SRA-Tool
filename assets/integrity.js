const SRAIntegrity = (function () {
  'use strict';

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function sha256Bytes(bytes) {
    const len = bytes.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
    view.setUint32(padded.length - 4, (len << 3) >>> 0);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    return [...h].map(x => x.toString(16).padStart(8, '0')).join('');
  }

  const utf8 = s => new TextEncoder().encode(s);
  const sha256Text = s => sha256Bytes(utf8(String(s)));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const HEX64 = /^[0-9a-f]{64}$/;

  const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  const available = () => !!subtle() && (typeof isSecureContext === 'undefined' || isSecureContext !== false);

  async function sha256File(bytes) {
    const s = subtle();
    if (!s) return sha256Bytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return hex(await s.digest('SHA-256', bytes));
  }

  function toBase64(bytes) {
    if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  function fromBase64(b64) {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function dataUrlBytes(url) {
    const m = /^data:[^,]*;base64,(.*)$/s.exec(String(url || ''));
    return m ? fromBase64(m[1]) : null;
  }

  function shortHash(h) {
    if (!HEX64.test(h || '')) return '';
    return `${h.slice(0, 4)} ${h.slice(4, 8)} … ${h.slice(56, 60)} ${h.slice(60, 64)}`;
  }
  const grouped = h => HEX64.test(h || '') ? h.match(/.{8}/g).join(' ') : '';

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }

  const SKIP_TOP = ['savedAt', 'exportedAt', 'evidenceIncluded'];
  function fingerprintSource(file) {
    const out = {};
    Object.keys(file || {}).forEach(k => { if (!SKIP_TOP.includes(k)) out[k] = file[k]; });
    if (out.controls && typeof out.controls === 'object') {
      const controls = {};
      Object.entries(out.controls).forEach(([id, c]) => {
        if (!c || typeof c !== 'object') { controls[id] = c; return; }
        controls[id] = { ...c, evidence: Array.isArray(c.evidence) ? c.evidence.map(e => {
          if (!e || typeof e !== 'object') return e;
          const { data, omitted, ...rest } = e;
          return rest;
        }) : c.evidence };
      });
      out.controls = controls;
    }
    return canonical(out);
  }
  const fingerprint = file => sha256Text(fingerprintSource(file));

  const PROTECTED = { format: 'SaberGuard HIPAA SRA (protected)', version: 1, iterations: 600000, minPassphrase: 12 };
  const isProtected = obj => !!obj && typeof obj === 'object' && obj.format === PROTECTED.format;

  async function deriveKey(passphrase, salt, iterations, usage) {
    const s = subtle();
    const base = await s.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
    return s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  async function protect(text, passphrase, opts = {}) {
    if (!available()) throw new Error('unavailable');
    if (String(passphrase).length < PROTECTED.minPassphrase) throw new Error('short');
    const iterations = opts.iterations || PROTECTED.iterations;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, utf8(text));
    return {
      format: PROTECTED.format,
      version: PROTECTED.version,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
      cipher: { name: 'AES-GCM', iv: toBase64(iv) },
      data: toBase64(new Uint8Array(data))
    };
  }

  function checkWrapper(w) {
    if (!isProtected(w)) throw new Error('format');
    if (w.version !== PROTECTED.version) throw new Error('version');
    const k = w.kdf || {}, c = w.cipher || {};
    if (k.name !== 'PBKDF2' || k.hash !== 'SHA-256' || c.name !== 'AES-GCM') throw new Error('format');
    if (!Number.isInteger(k.iterations) || k.iterations < 100000 || k.iterations > 10000000) throw new Error('format');
    if (typeof k.salt !== 'string' || typeof c.iv !== 'string' || typeof w.data !== 'string') throw new Error('format');
    const salt = fromBase64(k.salt), iv = fromBase64(c.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('format');
    return { salt, iv, iterations: k.iterations, data: fromBase64(w.data) };
  }

  async function unprotect(wrapper, passphrase) {
    if (!available()) throw new Error('unavailable');
    const w = checkWrapper(wrapper);
    const key = await deriveKey(String(passphrase), w.salt, w.iterations, 'decrypt');
    let plain;
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: w.iv }, key, w.data);
    } catch (err) {
      throw new Error('passphrase');
    }
    return new TextDecoder().decode(plain);
  }

  return { sha256Bytes, sha256Text, sha256File, dataUrlBytes, toBase64, fromBase64, shortHash, grouped, canonical, fingerprintSource, fingerprint, PROTECTED, isProtected, protect, unprotect, checkWrapper, available, HEX64 };
})();
if (typeof window !== 'undefined') window.SRAIntegrity = SRAIntegrity;
