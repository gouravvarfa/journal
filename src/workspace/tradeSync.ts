/**
 * Phase 10.1 — connects the existing local (Dexie) trade data to the
 * backend's new Trade model, so that sharing a TradingAccount actually
 * shares real data instead of an empty container.
 *
 * Deliberately a thin, best-effort layer:
 *  - Dexie remains the source of truth for the owner's own browser and
 *    offline use. Nothing here ever blocks or fails a local save — if the
 *    backend is unreachable, the sync is silently skipped (existing
 *    functionality must survive with or without a backend running).
 *  - Only accounts the user explicitly "enables sharing" for are ever
 *    synced. Nothing is pushed automatically for an unlinked account.
 *  - A Viewer/shared user never writes here — they only ever read remote
 *    trades via `fetchRemoteOnlyAccountsWithTrades`, rendered read-only.
 */
import { db } from '../database/db'
import type { Account, Trade } from '../types'
import { ApiError, workspaceApi, type TradeApi, type TradeUpsertPayload, type TradingAccountApi } from './api'

function toUpsertPayload(trade: Trade): TradeUpsertPayload {
  return {
    id: trade.id,
    trade_date: trade.tradeDate,
    segment: trade.segment,
    script_name: trade.scriptName,
    reason: trade.reason,
    quantity: trade.quantity,
    side: trade.side,
    entry_price: trade.entryPrice,
    exit_date: trade.exitDate || null,
    exit_price: trade.exitPrice,
    status: trade.status,
    gross_pnl: trade.grossPnl,
    net_pnl: trade.netPnl,
    notes: trade.notes,
    instrument_json: trade.instrument ? JSON.stringify(trade.instrument) : null,
  }
}

export function toLocalTrade(remote: TradeApi): Trade {
  return {
    id: remote.id,
    accountId: remote.trading_account_id,
    tradeDate: remote.trade_date,
    segment: remote.segment as Trade['segment'],
    scriptName: remote.script_name,
    reason: remote.reason,
    quantity: remote.quantity,
    side: remote.side,
    entryPrice: remote.entry_price,
    exitDate: remote.exit_date ?? '',
    exitPrice: remote.exit_price,
    status: remote.status as Trade['status'],
    grossPnl: remote.gross_pnl,
    netPnl: remote.net_pnl,
    notes: remote.notes,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    instrument: remote.instrument_json ? JSON.parse(remote.instrument_json) : undefined,
  }
}

export function toSyntheticAccount(remote: TradingAccountApi): Account {
  return {
    id: remote.id,
    accountName: remote.name,
    alias: remote.role === 'VIEWER' ? `${remote.name} (shared, read-only)` : `${remote.name} (shared)`,
    brokerName: remote.broker_name,
    accountType: remote.account_type,
    isArchived: remote.is_archived,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
  }
}

export async function getLinkedBackendAccountId(localAccountId: string): Promise<string | null> {
  const link = await db.accountLinks.get(localAccountId)
  return link?.backendAccountId ?? null
}

async function getLinkedLocalAccountIds(): Promise<Set<string>> {
  const links = await db.accountLinks.toArray()
  return new Set(links.map((l) => l.localAccountId))
}

async function getLinkedBackendAccountIds(): Promise<Set<string>> {
  const links = await db.accountLinks.toArray()
  return new Set(links.map((l) => l.backendAccountId))
}

/** Best-effort: push a created/updated local trade to its linked backend account, if any. Never throws. */
export async function syncTradeUpsert(trade: Trade): Promise<void> {
  try {
    const backendAccountId = await getLinkedBackendAccountId(trade.accountId)
    if (!backendAccountId) {
      return
    }
    await workspaceApi.updateTrade(backendAccountId, trade.id, toUpsertPayload(trade)).catch(async (err) => {
      // Not found remotely yet (e.g. created while offline) — create it instead of failing silently forever.
      if (err instanceof ApiError && err.status === 404) {
        await workspaceApi.createTrade(backendAccountId, toUpsertPayload(trade))
      } else {
        throw err
      }
    })
  } catch {
    // Best-effort only — local save already succeeded and must not be affected.
  }
}

/** Best-effort: push a local trade deletion to its linked backend account, if any. Never throws. */
export async function syncTradeDelete(accountId: string, tradeId: string): Promise<void> {
  try {
    const backendAccountId = await getLinkedBackendAccountId(accountId)
    if (!backendAccountId) {
      return
    }
    await workspaceApi.deleteTrade(backendAccountId, tradeId)
  } catch {
    // Best-effort only.
  }
}

/**
 * One-time "Enable sharing for this account" action: links a local account
 * to a backend trading account and uploads every existing local trade for
 * it. Safe to call more than once — the backend's bulk-import is
 * idempotent by trade id.
 */
export async function linkAccountForSharing(localAccountId: string, backendAccountId: string): Promise<{ imported: number; skippedExisting: number }> {
  const localTrades = await db.trades.where('accountId').equals(localAccountId).toArray()
  const result = await workspaceApi.bulkImportTrades(backendAccountId, localTrades.map(toUpsertPayload))
  await db.accountLinks.put({ localAccountId, backendAccountId, linkedAt: new Date().toISOString() })
  return { imported: result.imported, skippedExisting: result.skipped_existing }
}

export async function unlinkAccountFromSharing(localAccountId: string): Promise<void> {
  await db.accountLinks.delete(localAccountId)
}

/**
 * Every backend trading account this user can see that is NOT already
 * represented by a linked local account — i.e. genuinely remote data
 * (shared to this user by someone else, or an empty backend-only account
 * they created without linking it). Rendered read-only in App.tsx: this
 * layer never writes to Dexie for these, only surfaces them in memory.
 */
export async function fetchRemoteOnlyAccountsWithTrades(
  roles?: Array<TradingAccountApi['role']>,
): Promise<{ accounts: Account[]; trades: Trade[] }> {
  try {
    const [remoteAccounts, linkedBackendIds] = await Promise.all([workspaceApi.listAccounts(), getLinkedBackendAccountIds()])
    const remoteOnly = remoteAccounts.filter((a) => !linkedBackendIds.has(a.id) && (!roles || roles.includes(a.role)))
    if (remoteOnly.length === 0) {
      return { accounts: [], trades: [] }
    }

    const tradesByAccount = await Promise.all(
      remoteOnly.map((account) => workspaceApi.listTrades(account.id).catch(() => [] as TradeApi[])),
    )

    return {
      accounts: remoteOnly.map(toSyntheticAccount),
      trades: tradesByAccount.flat().map(toLocalTrade),
    }
  } catch {
    // No backend reachable, or not signed into the workspace layer — the
    // local-only app must keep working exactly as before.
    return { accounts: [], trades: [] }
  }
}

export async function getLinkedLocalAccountIdSet(): Promise<Set<string>> {
  return getLinkedLocalAccountIds()
}

/**
 * Business dashboard: loads one backend account (and its trades) directly,
 * with no Dexie involvement — Business data never touches local/personal
 * storage. The backend decides what this user may read.
 */
export async function fetchBusinessAccountWithTrades(account: TradingAccountApi): Promise<{ accounts: Account[]; trades: Trade[] }> {
  const remoteTrades = await workspaceApi.listTrades(account.id)
  return {
    accounts: [{ ...toSyntheticAccount(account), alias: account.name }],
    trades: remoteTrades.map(toLocalTrade),
  }
}

/** Creates or updates a trade directly on the backend (Business mode). Throws on failure, including 403 for viewers. */
export async function saveBusinessTrade(trade: Trade): Promise<void> {
  try {
    await workspaceApi.updateTrade(trade.accountId, trade.id, toUpsertPayload(trade))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await workspaceApi.createTrade(trade.accountId, toUpsertPayload(trade))
    } else {
      throw err
    }
  }
}

export async function deleteBusinessTrade(accountId: string, tradeId: string): Promise<void> {
  await workspaceApi.deleteTrade(accountId, tradeId)
}
