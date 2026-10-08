// Talks to the Voyz Booking server (server/). Without VITE_API_URL the app runs
// in demo mode on the device only.

const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export const API_URL = raw ? (raw.endsWith('/') ? raw : `${raw}/`) : '';
export const apiMode = API_URL !== '';

export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
    public status = 0,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'voyz:host-token';
const TRIPS_KEY = 'voyz:guest-trips';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked — the session lives until the page closes
  }
}

export const hostToken = {
  get: () => read(TOKEN_KEY),
  set: (t: string | null) => write(TOKEN_KEY, t),
};

/** Bookings made from this phone: id + secret token (the guest has no account, D-007). */
export interface TripRef {
  id: string;
  token: string;
}

export const guestTrips = {
  list(): TripRef[] {
    try {
      return JSON.parse(read(TRIPS_KEY) ?? '[]') as TripRef[];
    } catch {
      return [];
    }
  },
  add(t: TripRef) {
    write(TRIPS_KEY, JSON.stringify([t, ...guestTrips.list().filter((x) => x.id !== t.id)]));
  },
  token(id: string): string | null {
    return guestTrips.list().find((t) => t.id === id)?.token ?? null;
  },
};

export async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: { auth?: boolean; guestToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth) {
    const t = hostToken.get();
    if (t) headers.authorization = `Bearer ${t}`;
  }
  if (opts.guestToken) headers['x-guest-token'] = opts.guestToken;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path.replace(/^\//, '')}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure('offline', 'No connection');
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
  try {
    json = await res.json();
  } catch {
    throw new ApiFailure('internal', `HTTP ${res.status}`, undefined, res.status);
  }
  if (!json.ok) {
    if (res.status === 401) hostToken.set(null);
    throw new ApiFailure(json.error?.code ?? 'internal', json.error?.message ?? 'Error', json.error?.details, res.status);
  }
  return json.data as T;
}
