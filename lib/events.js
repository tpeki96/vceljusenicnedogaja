const SUPABASE_URL = "https://awyberrgkaaawxfgquvd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_49txmxFiwCggw-XyTFlssA_BthU47_o";
const TIME_ZONE = "Europe/Ljubljana";

function celjeDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12))
    .toISOString()
    .slice(0, 10);
}

function weekendDateKeys(todayKey) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = addDays(todayKey, daysToSaturday);
  return [saturday, addDays(saturday, 1)];
}

function formatTime(iso, includeWeekday = false) {
  return new Intl.DateTimeFormat("sl-SI", {
    timeZone: TIME_ZONE,
    ...(includeWeekday ? { weekday: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(".", "")
    .toLocaleUpperCase("sl-SI");
}

function formatPrice(value) {
  if (!value) return null;
  const price = String(value).trim();
  if (/^\d+(?:[,.]\d+)?$/.test(price)) return `${price} €`;
  return price;
}

function toUiEvent(event, includeWeekday = false) {
  return {
    id: event.id,
    time: formatTime(event.start_at, includeWeekday),
    title: event.title,
    venue: event.venue || "Celje",
    category: event.category || "Dogodek",
    free: event.is_free === true,
    price: event.is_free === true ? null : formatPrice(event.price_text),
    url: event.source_url,
  };
}

export async function fetchUpcomingEvents() {
  const lowerBound = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "id,title,start_at,venue,category,is_free,price_text,source_url,status",
    status: "eq.published",
    start_at: `gte.${lowerBound}`,
    order: "start_at.asc",
    limit: "300",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/events?${params}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error("Supabase events request failed", response.status, await response.text());
    return [];
  }

  return response.json();
}

export function buildPeriods(events, now = new Date()) {
  const todayKey = celjeDateKey(now);
  const tomorrowKey = addDays(todayKey, 1);
  const [saturdayKey, sundayKey] = weekendDateKeys(todayKey);

  const byDate = new Map();
  for (const event of events) {
    const key = celjeDateKey(new Date(event.start_at));
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(event);
  }

  const today = byDate.get(todayKey) || [];
  const tomorrow = byDate.get(tomorrowKey) || [];
  const weekend = [
    ...(byDate.get(saturdayKey) || []),
    ...(byDate.get(sundayKey) || []),
  ].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  return {
    today: {
      label: "Danes",
      count: today.length,
      heading: "Kaj se “ne dogaja” danes?",
      events: today.map((event) => toUiEvent(event)),
    },
    tomorrow: {
      label: "Jutri",
      count: tomorrow.length,
      heading: "Kaj se “ne dogaja” jutri?",
      events: tomorrow.map((event) => toUiEvent(event)),
    },
    weekend: {
      label: "Vikend",
      count: weekend.length,
      heading: "Kaj se “ne dogaja” ta vikend?",
      events: weekend.map((event) => toUiEvent(event, true)),
    },
  };
}
