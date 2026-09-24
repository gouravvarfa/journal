/**
 * RFC 6238 TOTP generator — the same algorithm any authenticator app uses.
 * Implemented against the Web Crypto API only (HMAC-SHA1), no dependency,
 * so the TOTP secret never leaves this device/browser.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Uint8Array {
  const cleaned = input.trim().toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = ''
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid TOTP secret: not valid Base32.')
    }
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

function intToBuffer(counter: number): Uint8Array {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  // JS numbers are safe up to 2^53; counter (time-step count) never gets close to that.
  view.setUint32(4, counter)
  return new Uint8Array(buffer)
}

/** Generates the current 6-digit TOTP code for a Base32 secret (step = 30s, per RFC 6238 default). */
export async function generateTotp(base32Secret: string, stepSeconds = 30, digits = 6): Promise<string> {
  const keyBytes = base32Decode(base32Secret)
  const counter = Math.floor(Date.now() / 1000 / stepSeconds)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )

  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, intToBuffer(counter).buffer as ArrayBuffer))

  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  const code = (binary % 10 ** digits).toString().padStart(digits, '0')
  return code
}
