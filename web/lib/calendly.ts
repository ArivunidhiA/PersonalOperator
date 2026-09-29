import { safeRedis } from "./rate-limit";

/**
 * Recent bookings from Ariv's Calendly (read-only), for his dashboard. Booking
 * links from this site carry utm_content = the call's session id (s_...) or
 * the visitor id (v_...), which Calendly stores on the invitee, so a booking
 * can be matched to the visit or call it came from. Cached for 5 minutes.
 */
export type Booking = {
  name: string;
  email: string;
  bookedAt: string;
  startTime: string;
  status: string;
  event: string;
  utmSource: string | null;
  ref: string | null;
};

const API = "https://api.calendly.com";

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`calendly ${res.status}`);
  return (await res.json()) as T;
}

type EventsPage = { collection: { uri: string; name: string; start_time: string; status: string }[] };
type InviteesPage = {
  collection: { name: string; email: string; created_at: string; status: string; tracking?: { utm_source?: string | null; utm_content?: string | null } }[];
};

export async function recentBookings(days = 60): Promise<Booking[] | null> {
  const key = process.env.CALENDLY_API_KEY;
  if (!key) return null;
  const cacheKey = `cal:bookings:v1:${days}`;
  const cached = await safeRedis((r) => r.get<Booking[]>(cacheKey), null);
  if (cached) return cached;
  try {
    const me = await get<{ resource: { uri: string } }>("/users/me", key);
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const events = await get<EventsPage>(
      `/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&min_start_time=${encodeURIComponent(since)}&count=40&sort=start_time:desc`,
      key,
    );
    const out: Booking[] = [];
    const list = events.collection.slice(0, 40);
    for (let i = 0; i < list.length; i += 5) {
      const batch = await Promise.all(
        list.slice(i, i + 5).map(async (ev) => {
          const inv = await get<InviteesPage>(`${ev.uri}/invitees?count=10`, key).catch(() => ({ collection: [] }) as InviteesPage);
          return inv.collection.map((p) => ({
            name: p.name,
            email: p.email,
            bookedAt: p.created_at,
            startTime: ev.start_time,
            status: ev.status === "canceled" || p.status === "canceled" ? "canceled" : "active",
            event: ev.name,
            utmSource: p.tracking?.utm_source ?? null,
            ref: p.tracking?.utm_content ?? null,
          }));
        }),
      );
      out.push(...batch.flat());
    }
    out.sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
    await safeRedis((r) => r.set(cacheKey, out, { ex: 300 }), null);
    return out;
  } catch {
    return null;
  }
}
