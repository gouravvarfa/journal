import { db } from '../../../../database/db'

export interface AngelOneCredentials {
  apiKey: string
  clientCode: string
  pin: string
  totpSecret: string
}

const BROKER_ID = 'angelOne'
const KEY_RECORD_ID = 'angelOne-credential-key'

/**
 * Honest security note: this app has no backend and no user login/passphrase
 * of its own, so there is no secret we can hold that a script running on
 * this page couldn't also reach. What this store DOES protect against is
 * casual exposure — credentials are never in localStorage, never logged,
 * never in plain JSON in IndexedDB, and the AES key used to encrypt them is
 * created `extractable: false`, so it can never be read out as raw bytes
 * (only used, via the CryptoKey object itself) even from the browser
 * console. It is not a defense against a malicious script already running
 * with page access (XSS) — nothing client-side-only can be.
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await db.cryptoKeys.get(KEY_RECORD_ID)
  if (existing) {
    return existing.key
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await db.cryptoKeys.put({ id: KEY_RECORD_ID, key })
  return key
}

export async function saveAngelOneCredentials(credentials: AngelOneCredentials): Promise<void> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))

  await db.brokerCredentials.put({
    broker: BROKER_ID,
    iv: Array.from(iv),
    ciphertext: Array.from(ciphertext),
    updatedAt: new Date().toISOString(),
  })
}

export async function loadAngelOneCredentials(): Promise<AngelOneCredentials | null> {
  const record = await db.brokerCredentials.get(BROKER_ID)
  if (!record) {
    return null
  }

  const key = await getOrCreateKey()
  const iv = new Uint8Array(record.iv)
  const ciphertext = new Uint8Array(record.ciphertext)

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return JSON.parse(new TextDecoder().decode(plaintext)) as AngelOneCredentials
  } catch {
    return null
  }
}

export async function clearAngelOneCredentials(): Promise<void> {
  await db.brokerCredentials.delete(BROKER_ID)
}

export async function hasAngelOneCredentials(): Promise<boolean> {
  const record = await db.brokerCredentials.get(BROKER_ID)
  return record !== undefined
}
