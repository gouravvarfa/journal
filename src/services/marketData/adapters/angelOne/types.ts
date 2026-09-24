export type AngelOneConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'auth-error' | 'network-error'

export interface AngelOneStatusSnapshot {
  status: AngelOneConnectionStatus
  message: string
  clientCode?: string
}
