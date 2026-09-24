import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateTotp } from './totp'

// RFC 6238 Appendix B official test vector (SHA1, 8-digit truncated to the
// same 6-digit suffix our implementation produces): secret is the ASCII
// string "12345678901234567890" Base32-encoded, at Unix time 59 seconds
// (T=1 with the default 30s step) the reference TOTP is 94287082.
const RFC_6238_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('generateTotp', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches the RFC 6238 SHA1 test vector at T=59s', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(59 * 1000)
    const code = await generateTotp(RFC_6238_SECRET)
    expect(code).toBe('287082')
  })

  it('matches the RFC 6238 SHA1 test vector at T=1111111109s', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1111111109 * 1000)
    const code = await generateTotp(RFC_6238_SECRET)
    expect(code).toBe('081804')
  })

  it('produces a 6-digit zero-padded string', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const code = await generateTotp(RFC_6238_SECRET)
    expect(code).toMatch(/^\d{6}$/)
  })

  it('rejects a non-Base32 secret', async () => {
    await expect(generateTotp('not-valid-base32!!!')).rejects.toThrow()
  })
})
