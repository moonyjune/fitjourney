// Web Push sending with nothing but WebCrypto (Deno and Node 20+ alike), so no npm library has to run in the Edge runtime:
// - VAPID (RFC 8292): an ES256 JWT signed with the server's key, sent as `Authorization: vapid t=<jwt>, k=<public key>`.
// - Payload encryption "aes128gcm" (RFC 8291 + RFC 8188): ECDH with the browser's p256dh key, HKDF with its auth secret,
//   one AES-128-GCM record.
// Pure (no Deno APIs), unit-tested in jest against the RFC 8291 example.

type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Bytes {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const copy = (b: Uint8Array): Bytes => concatBytes(b);

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', copy(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, copy(data)));
}

/** A P-256 key pair given as the uncompressed public point (65 bytes) and the private scalar (32 bytes), as JWK. */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('bad P-256 public key');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64urlEncode(publicKey.slice(1, 33)), y: b64urlEncode(publicKey.slice(33, 65)), ext: true };
  if (privateKey) {
    if (privateKey.length !== 32) throw new Error('bad P-256 private key');
    jwk.d = b64urlEncode(privateKey);
  }
  return jwk;
}

export interface VapidKeys {
  /** base64url, uncompressed P-256 point (the key the browser subscribed with). */
  publicKey: string;
  /** base64url, 32-byte private scalar. */
  privateKey: string;
  /** `mailto:` or `https:` contact for the push service. */
  subject: string;
}

/** The `Authorization` header value for one push service origin (VAPID, valid `ttlSec`, at most 24 h). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSec = Math.floor(Date.now() / 1000), ttlSec = 12 * 3600): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + Math.min(ttlSec, 24 * 3600), sub: keys.subject })));
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(b64urlDecode(keys.publicKey), b64urlDecode(keys.privateKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  // WebCrypto gives the raw r||s signature JWS wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, enc.encode(`${header}.${payload}`)));
  return `vapid t=${header}.${payload}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

export interface PushKeys {
  /** base64url browser public key (subscription.keys.p256dh). */
  p256dh: string;
  /** base64url 16-byte auth secret (subscription.keys.auth). */
  auth: string;
}

/** Test hooks: a fixed salt and sender key pair (the RFC example); real sends make fresh ones. */
export interface EncryptOptions {
  salt?: Uint8Array;
  senderKeys?: { publicKey: Uint8Array; privateKey: Uint8Array };
  recordSize?: number;
}

/** The request body for one push message: RFC 8188 header (salt, record size, sender key) + a single encrypted record. */
export async function encryptPayload(plaintext: Uint8Array, keys: PushKeys, options: EncryptOptions = {}): Promise<Bytes> {
  const uaPublic = b64urlDecode(keys.p256dh);
  const authSecret = b64urlDecode(keys.auth);
  const salt = options.salt ? copy(options.salt) : crypto.getRandomValues(new Uint8Array(16));
  const rs = options.recordSize ?? 4096;
  if (plaintext.length + 17 + 86 > rs) throw new Error('payload too large for one record');

  let asPublic: Bytes;
  let asPrivate: CryptoKey;
  if (options.senderKeys) {
    asPublic = copy(options.senderKeys.publicKey);
    asPrivate = await crypto.subtle.importKey('jwk', p256Jwk(asPublic, options.senderKeys.privateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    asPrivate = pair.privateKey;
  }
  const uaKey = await crypto.subtle.importKey('raw', copy(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));

  // RFC 8291 section 3.4: IKM from the auth secret, then RFC 8188 CEK and nonce from the salt.
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concatBytes(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concatBytes(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  // The last (only) record ends with the 0x02 delimiter, no further padding.
  const padded = concatBytes(plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concatBytes(header, asPublic, cipher);
}

export interface PushTarget extends PushKeys {
  endpoint: string;
}

export interface PushResult {
  status: number;
  /** The subscription is gone (404 / 410): delete it. */
  gone: boolean;
  ok: boolean;
}

/** Sends one message. `fetchImpl` is injectable for tests. */
export async function sendWebPush(
  target: PushTarget,
  payload: unknown,
  vapid: VapidKeys,
  options: { ttlSec?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {}
): Promise<PushResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), target);
  const res = await (options.fetchImpl ?? fetch)(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSec ?? 3600),
      Urgency: options.urgency ?? 'normal',
    },
    body,
  });
  // Drain the body so the connection is freed.
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410 };
}
