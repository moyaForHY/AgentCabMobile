type Handler = () => void
const listeners = new Map<string, Set<Handler>>()

export const events = {
  on(event: string, handler: Handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler)
    return () => { listeners.get(event)?.delete(handler) }
  },
  emit(event: string) {
    listeners.get(event)?.forEach(fn => fn())
  },
}

// Event names
export const EVENT_CALL_COMPLETED = 'call_completed'
export const EVENT_WALLET_CHANGED = 'wallet_changed'
export const EVENT_PINNED_CHANGED = 'pinned_changed'
