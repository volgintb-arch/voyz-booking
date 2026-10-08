import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiMode } from '../api/client';
import { sendToAynes } from '../integrations/aynes';
import { nowWithOffset } from '../domain/dates';
import { expireHolds, initialState, markOutbox, type AppState } from './state';

// Server mode keeps its own cache, so demo data never mixes with real bookings.
const STORAGE_KEY = apiMode ? 'voyz-booking:api:v1' : 'voyz-booking:v2';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.schema === 2) return parsed;
    }
  } catch {
    // storage unavailable (private mode) — start from the demo seed
  }
  return apiMode ? emptyState() : initialState();
}

/** Server mode starts empty and fills from the API (catalog or host workspace). */
function emptyState(): AppState {
  return {
    ...initialState(),
    properties: [],
    categories: [],
    units: [],
    seasons: [],
    bookings: [],
    payments: [],
    blocks: [],
    icalChannels: [],
    outbox: [],
    hostId: '',
    host: null,
  };
}

function save(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore: the app keeps working in memory
  }
}

interface Store {
  state: AppState;
  /** Applies a pure transition from data/state.ts. */
  update: (fn: (s: AppState) => AppState) => void;
  /** Replaces state with what the server answered. */
  replace: (fn: (s: AppState) => AppState) => void;
  online: boolean;
  syncing: boolean;
  flush: () => Promise<void>;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [syncing, setSyncing] = useState(false);
  const online = useOnline();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => save(state), [state]);
  useEffect(() => {
    document.documentElement.lang = state.lang;
  }, [state.lang]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);

  const flush = useCallback(async () => {
    const { aynes, outbox } = stateRef.current;
    // In server mode the server talks to Aynes.
    if (apiMode || !aynes.connected || !navigator.onLine) return;
    const waiting = outbox.filter((o) => o.status !== 'sent');
    if (waiting.length === 0) return;
    setSyncing(true);
    for (const item of waiting) {
      const result = await sendToAynes(item, stateRef.current.aynes.connected);
      setState((s) => markOutbox(s, item.id, result));
    }
    setSyncing(false);
  }, []);

  // Offline-first: whatever was saved on the phone goes out once the network is back.
  // Failed items are retried by hand or on the next 'online' event, never in a loop.
  const pending = state.outbox.filter((o) => o.status === 'pending').length;
  useEffect(() => {
    if (online && state.aynes.connected && pending > 0 && !syncing) void flush();
  }, [online, state.aynes.connected, pending, syncing, flush]);
  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  // Demo mode: the device releases unpaid bookings; in server mode the server does it (D-001).
  useEffect(() => {
    if (apiMode) return;
    const tick = () => setState((s) => {
      const next = expireHolds(s, new Date(), nowWithOffset('Asia/Bishkek'));
      return next === s ? s : next;
    });
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const reset = useCallback(() => setState({ ...(apiMode ? emptyState() : initialState()), lang: stateRef.current.lang }), []);

  const value = useMemo(
    () => ({ state, update, replace: update, online, syncing, flush, reset }),
    [state, update, online, syncing, flush, reset],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}
