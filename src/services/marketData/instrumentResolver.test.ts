import { describe, expect, it } from 'vitest'
import { resolveInstrument } from './instrumentResolver'

describe('instrument resolver', () => {
  it('resolves RBL Bank to RBLBANK on NSE', () => {
    const result = resolveInstrument('RBL Bank')
    expect(result).toMatchObject({ symbol: 'RBLBANK', market: 'NSE', instrumentType: 'EQUITY' })
  })

  it('resolves Reliance to RELIANCE on NSE', () => {
    const result = resolveInstrument('Reliance')
    expect(result).toMatchObject({ symbol: 'RELIANCE', market: 'NSE' })
  })

  it('resolves exact trading symbol TCS', () => {
    const result = resolveInstrument('TCS')
    expect(result).toMatchObject({ symbol: 'TCS', market: 'NSE' })
  })

  it('resolves Infosys to INFY', () => {
    const result = resolveInstrument('Infosys')
    expect(result).toMatchObject({ symbol: 'INFY', market: 'NSE' })
  })

  it('resolves State Bank of India to SBIN', () => {
    const result = resolveInstrument('State Bank of India')
    expect(result).toMatchObject({ symbol: 'SBIN', market: 'NSE' })
  })

  it('resolves HDFC Bank to HDFCBANK', () => {
    const result = resolveInstrument('HDFC Bank')
    expect(result).toMatchObject({ symbol: 'HDFCBANK', market: 'NSE' })
  })

  it('is case-insensitive and tolerant of extra spaces', () => {
    const result = resolveInstrument('  reliance   ')
    expect(result).toMatchObject({ symbol: 'RELIANCE' })
  })

  it('resolves an NFO option string into a NIFTY CE instrument', () => {
    const result = resolveInstrument('NIFTY 23700 CE')
    expect(result).toMatchObject({
      market: 'NFO',
      instrumentType: 'OPTION',
      exchangeSymbol: 'NIFTY',
      strike: 23700,
      optionType: 'CE',
    })
  })

  it('resolves an NFO future string', () => {
    const result = resolveInstrument('RELIANCE FUT')
    expect(result).toMatchObject({ market: 'NFO', instrumentType: 'FUTURE', exchangeSymbol: 'RELIANCE' })
  })

  it('resolves index NIFTY to NSE index', () => {
    const result = resolveInstrument('NIFTY')
    expect(result).toMatchObject({ symbol: 'NIFTY', market: 'NSE', instrumentType: 'INDEX' })
  })

  it('resolves BANKNIFTY alias variants', () => {
    expect(resolveInstrument('Bank Nifty')).toMatchObject({ symbol: 'BANKNIFTY' })
    expect(resolveInstrument('banknifty')).toMatchObject({ symbol: 'BANKNIFTY' })
  })

  it('returns null for a completely unknown script', () => {
    expect(resolveInstrument('ZZZNOTREAL123')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(resolveInstrument('   ')).toBeNull()
  })
})
