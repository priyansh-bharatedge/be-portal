/**
 * BharatEdge Portal - Universal JWT Authentication Utility
 * Implements HMAC-SHA256 (HS256) JWT generation, parsing, and 24-Hour expiration validation.
 * Fully typed, self-contained, and runs cleanly across browser and node environments.
 */

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string;
  designation?: string;
  zohoId?: string;
  empId?: string;
  iat: number; // Issued at timestamp (in seconds)
  exp: number; // Expiration timestamp (in seconds) - exactly 24 Hours
  [key: string]: any;
}

export interface JwtVerifyResult {
  isValid: boolean;
  isExpired: boolean;
  payload: JwtPayload | null;
  error?: string;
  remainingSeconds?: number;
  remainingFormatted?: string;
  expiresAt?: Date;
}

// 24 Hours in seconds = 86400 (86,400 seconds / 1,440 minutes / 24 hours)
export const JWT_EXPIRY_SECONDS = 24 * 60 * 60; 
export const JWT_EXPIRY_MS = JWT_EXPIRY_SECONDS * 1000;

// Default secret key for HS256 signing
const JWT_SECRET = 'bharatedge_crm_hrms_portal_jwt_secret_2026_x89q2';

/**
 * UTF-8 string to Base64URL
 */
function base64UrlEncode(str: string): string {
  try {
    const encoded = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(encoded)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch (e) {
    return '';
  }
}

/**
 * Base64URL to UTF-8 string
 */
function base64UrlDecode(str: string): string {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const decoded = atob(base64);
    return decodeURIComponent(
      Array.from(decoded)
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (e) {
    return '';
  }
}

/**
 * Standard SHA-256 implementation with strict typed arrays
 */
function sha256Bytes(input: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const len = input.length;
  const bitLen = len * 8;
  const newLen = (((len + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(newLen);
  padded.set(input);
  padded[len] = 0x80;

  // Append 64-bit length in big-endian
  const view = new DataView(padded.buffer);
  view.setUint32(newLen - 4, bitLen, false);

  const w = new Uint32Array(64);

  for (let i = 0; i < newLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let j = 0; j < 64; j++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[j] + w[j]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const result = new Uint8Array(32);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h0, false);
  resultView.setUint32(4, h1, false);
  resultView.setUint32(8, h2, false);
  resultView.setUint32(12, h3, false);
  resultView.setUint32(16, h4, false);
  resultView.setUint32(20, h5, false);
  resultView.setUint32(24, h6, false);
  resultView.setUint32(28, h7, false);

  return result;
}

/**
 * HMAC-SHA256 calculation
 */
function hmacSha256(message: string, secret: string): string {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(secret);
  const key = rawKey.length > 64 ? sha256Bytes(rawKey) : rawKey;
  const msg = encoder.encode(message);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const k = i < key.length ? key[i] : 0;
    oKeyPad[i] = k ^ 0x5c;
    iKeyPad[i] = k ^ 0x36;
  }

  const innerMsg = new Uint8Array(iKeyPad.length + msg.length);
  innerMsg.set(iKeyPad, 0);
  innerMsg.set(msg, iKeyPad.length);
  const innerHash = sha256Bytes(innerMsg);

  const outerMsg = new Uint8Array(oKeyPad.length + innerHash.length);
  outerMsg.set(oKeyPad, 0);
  outerMsg.set(innerHash, oKeyPad.length);
  const outerHash = sha256Bytes(outerMsg);

  // Convert bytes to Base64URL
  let binStr = '';
  for (let i = 0; i < outerHash.length; i++) {
    binStr += String.fromCharCode(outerHash[i]);
  }
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Creates a signed JWT token with exact 24-hour expiration
 * @param user User payload details
 * @param expiresInSeconds Optional custom validity in seconds (defaults to 24 hours / 86400 seconds)
 */
export function generateJwtToken(user: Partial<JwtPayload>, expiresInSeconds: number = JWT_EXPIRY_SECONDS): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;

  const payload: JwtPayload = {
    id: user.id || user.empId || 'USER',
    email: user.email || '',
    name: user.name || 'User',
    role: user.role || 'TM',
    department: user.department || 'Operations',
    designation: user.designation || 'Employee',
    zohoId: user.zohoId || '',
    empId: user.empId || user.id || '',
    iat: now,
    exp: exp,
    ...user
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSha256(dataToSign, JWT_SECRET);

  return `${dataToSign}.${signature}`;
}

/**
 * Validates a JWT token, checks HMAC-SHA256 signature, and enforces 24-hour expiration.
 * @param token The JWT string (header.payload.signature)
 */
export function verifyJwtToken(token: string | null | undefined): JwtVerifyResult {
  if (!token || typeof token !== 'string') {
    return {
      isValid: false,
      isExpired: true,
      payload: null,
      error: 'Token is missing or empty'
    };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return {
      isValid: false,
      isExpired: true,
      payload: null,
      error: 'Malformed JWT token structure'
    };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // 1. Verify Signature
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = hmacSha256(dataToSign, JWT_SECRET);

  if (signature !== expectedSignature) {
    return {
      isValid: false,
      isExpired: false,
      payload: null,
      error: 'Invalid JWT signature'
    };
  }

  // 2. Decode Payload
  let payload: JwtPayload;
  try {
    const jsonStr = base64UrlDecode(encodedPayload);
    payload = JSON.parse(jsonStr);
  } catch (e) {
    return {
      isValid: false,
      isExpired: false,
      payload: null,
      error: 'Failed to parse JWT payload'
    };
  }

  // 3. Check 24-Hour Expiration
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);

  if (!exp || isNaN(exp)) {
    return {
      isValid: false,
      isExpired: true,
      payload: null,
      error: 'JWT expiration timestamp is missing or invalid'
    };
  }

  if (now >= exp) {
    return {
      isValid: false,
      isExpired: true,
      payload,
      error: 'Session has expired (> 24 hours). Please log in again.',
      remainingSeconds: 0,
      remainingFormatted: '0m',
      expiresAt: new Date(exp * 1000)
    };
  }

  const remainingSec = exp - now;
  const hours = Math.floor(remainingSec / 3600);
  const minutes = Math.floor((remainingSec % 3600) / 60);
  const remainingFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return {
    isValid: true,
    isExpired: false,
    payload,
    remainingSeconds: remainingSec,
    remainingFormatted,
    expiresAt: new Date(exp * 1000)
  };
}

/**
 * Quick synchronous helper to check if current token in storage is valid and not expired (> 24h)
 */
export function isStoredTokenValid(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const token = localStorage.getItem('be_auth_token');
  if (!token) return false;
  const res = verifyJwtToken(token);
  return res.isValid && !res.isExpired;
}

/**
 * Retrieves the stored JWT token
 */
export function getStoredJwtToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return localStorage.getItem('be_auth_token');
}

/**
 * Saves JWT token and 24-hour expiration markers to localStorage
 */
export function setStoredJwtToken(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const verify = verifyJwtToken(token);
  if (verify.isValid && verify.payload) {
    localStorage.setItem('be_auth_token', token);
    localStorage.setItem('be_auth_login_time', (verify.payload.iat * 1000).toString());
    localStorage.setItem('be_auth_expires_at', (verify.payload.exp * 1000).toString());
  }
}

/**
 * Clears JWT token and session data on logout / expiration
 */
export function clearStoredJwtToken(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  localStorage.removeItem('be_auth_token');
  localStorage.removeItem('be_auth_login_time');
  localStorage.removeItem('be_auth_expires_at');
}
