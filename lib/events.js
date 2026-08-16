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

function dateParts(iso) {
  const parts = new Intl.DateTimeFormat("sl-SI", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value.replace(".", "")]));
}

function formatRange(startIso, endIso) {
  if (!endIso) return null;
  const start = dateParts(startIso);
  const end = dateParts(endIso);
  if (start.month === end.month) {
    return `${start.day}.–${end.day}. ${end.month}`.toLocaleUpperCase("sl-SI");
  }
  return `${start.day}. ${start.month}–${end.day}. ${end.month}`.toLocaleUpperCase("sl-SI");
}

function formatPrice(value) {
  if (!value) return null;
  const price = String(value).trim();
  if (/^\d+(?:[,.]\d+)?$/.test(price)) return `${price} €`;
  return price;
}

function eventActiveOn(event, dateKey) {
  const start = celjeDateKey(new Date(event.start_at));
  if (event.event_type === "single" || !event.end_at) return start === dateKey;
  const end = celjeDateKey(new Date(event.end_at));
  return start <= dateKey && dateKey <= end;
}

function toUiEvent(event, includeWeekday = false) {
  const range = event.end_at ? formatRange(event.start_at, event.end_at) : null;
  const longRunning = event.event_type === "ongoing";
  const multiday = event.event_type === "multiday";

  return {
    id: event.id,
    time: longRunning ? "V TEKU" : multiday && range ? range : formatTime(event.start_at, includeWeekday),
    title: event.title,
    venue: event.venue || "Celje",
    category: event.category || "Dogodek",
    free: event.is_free === true,
    price: event.is_free === true ? null : formatPrice(event.price_text),
    duration: longRunning && range ? range : null,
    eventType: event.event_type,
    url: event.source_url,
  };
}

export async function fetchUpcomingEvents() {
  // We look back far enough to include exhibitions/programmes that started weeks ago
  // but are still active today. Duplicates and out-of-area records stay in the DB,
  // but are deliberately excluded from the public feed.
  const lowerBound = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "id,title,start_at,end_at,all_day,venue,category,is_free,price_text,source_url,status,event_type,duplicate_of,location_status",
    status: "eq.published",
    duplicate_of: "is.null",
    location_status: "eq.in_area",
    start_at: `gte.${lowerBound}`,
    order: "start_at.asc",
    limit: "600",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/events?${params}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error("Supabase events request failed", response.status, await response.text());
    return [];
  }

  return response.json();
}

function uniqueActive(events, dateKeys) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    if (event.event_type === "ongoing") continue;
    if (!dateKeys.some((key) => eventActiveOn(event, key))) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
}

export function buildPeriods(events, now = new Date()) {
  const todayKey = celjeDateKey(now);
  const tomorrowKey = addDays(todayKey, 1);
  const [saturdayKey, sundayKey] = weekendDateKeys(todayKey);

  const today = uniqueActive(events, [todayKey]);
  const tomorrow = uniqueActive(events, [tomorrowKey]);
  const weekend = uniqueActive(events, [saturdayKey, sundayKey]);
  const ongoing = events
    .filter((event) => event.event_type === "ongoing" && eventActiveOn(event, todayKey))
    .sort((a, b) => new Date(a.end_at || a.start_at) - new Date(b.end_at || b.start_at));

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
    ongoing: {
      label: "V teku",
      count: ongoing.length,
      heading: "Kaj je še v teku?",
      events: ongoing.map((event) => toUiEvent(event)),
    },
  };
}
