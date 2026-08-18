import { getCopy, LOCALES } from "./i18n";

const SUPABASE_URL = "https://awyberrgkaaawxfgquvd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_49txmxFiwCggw-XyTFlssA_BthU47_o";
const TIME_ZONE = "Europe/Ljubljana";

function localeFor(lang) {
  return LOCALES[lang] || LOCALES.sl;
}

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

function formatTime(iso, lang, includeWeekday = false) {
  const locale = localeFor(lang);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    ...(includeWeekday ? { weekday: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(".", "")
    .toLocaleUpperCase(locale);
}

function dateParts(iso, lang) {
  const locale = localeFor(lang);
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value.replace(".", "")]));
}

function formatRange(startIso, endIso, lang) {
  if (!endIso) return null;
  const locale = localeFor(lang);
  const start = dateParts(startIso, lang);
  const end = dateParts(endIso, lang);
  if (start.month === end.month) {
    return `${start.day}–${end.day} ${end.month}`.toLocaleUpperCase(locale);
  }
  return `${start.day} ${start.month}–${end.day} ${end.month}`.toLocaleUpperCase(locale);
}

function formatPrice(value) {
  if (!value) return null;
  const price = String(value).trim();
  if (/^\d+(?:[,.]\d+)?$/.test(price)) return `${price} €`;
  return price;
}

function formatDateKey(dateKey, lang) {
  return new Intl.DateTimeFormat(localeFor(lang), {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function eventActiveOn(event, dateKey) {
  const start = celjeDateKey(new Date(event.start_at));
  if (event.event_type === "single" || !event.end_at) return start === dateKey;
  const end = celjeDateKey(new Date(event.end_at));
  return start <= dateKey && dateKey <= end;
}

function toUiEvent(event, lang, includeWeekday = false) {
  const copy = getCopy(lang).events;
  const range = event.end_at ? formatRange(event.start_at, event.end_at, lang) : null;
  const longRunning = event.event_type === "ongoing";
  const multiday = event.event_type === "multiday";

  return {
    id: event.id,
    time: longRunning ? copy.ongoing.toLocaleUpperCase(localeFor(lang)) : multiday && range ? range : formatTime(event.start_at, lang, includeWeekday),
    title: event.title,
    venue: event.venue || "Celje",
    category: event.category || copy.event,
    free: event.is_free === true,
    price: event.is_free === true ? null : formatPrice(event.price_text),
    duration: longRunning && range ? range : null,
    eventType: event.event_type,
    url: event.source_url,
  };
}

async function fetchJson(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    console.error("Supabase request failed", response.status, await response.text());
    return [];
  }

  return response.json();
}

export async function fetchUpcomingEvents(lang = "sl") {
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

  const events = await fetchJson(`events?${params}`);
  if (lang === "sl" || events.length === 0) return events;

  const translationParams = new URLSearchParams({
    select: "event_id,title,category",
    language: `eq.${lang}`,
    limit: "1000",
  });
  const translations = await fetchJson(`event_translations?${translationParams}`);
  const byEvent = new Map(translations.map((row) => [row.event_id, row]));

  return events.map((event) => {
    const translation = byEvent.get(event.id);
    if (!translation) return event;
    return {
      ...event,
      title: translation.title || event.title,
      category: translation.category || event.category,
    };
  });
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

export function buildPeriods(events, lang = "sl", now = new Date()) {
  const copy = getCopy(lang).events;
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
      label: copy.today,
      count: today.length,
      heading: copy.todayHeading,
      events: today.map((event) => toUiEvent(event, lang)),
    },
    tomorrow: {
      label: copy.tomorrow,
      count: tomorrow.length,
      heading: copy.tomorrowHeading,
      events: tomorrow.map((event) => toUiEvent(event, lang)),
    },
    weekend: {
      label: copy.weekend,
      count: weekend.length,
      heading: copy.weekendHeading,
      events: weekend.map((event) => toUiEvent(event, lang, true)),
    },
    ongoing: {
      label: copy.ongoing,
      count: ongoing.length,
      heading: copy.ongoingHeading,
      events: ongoing.map((event) => toUiEvent(event, lang)),
    },
  };
}

export function buildStats(events, lang = "sl", now = new Date(), days = 30) {
  const startKey = celjeDateKey(now);
  const endKey = addDays(startKey, days - 1);
  const dateKeys = Array.from({ length: days }, (_item, index) => addDays(startKey, index));

  const windowEvents = events.filter((event) => {
    if (event.event_type === "ongoing") return false;
    const eventStart = celjeDateKey(new Date(event.start_at));
    const eventEnd = celjeDateKey(new Date(event.end_at || event.start_at));
    return eventStart <= endKey && eventEnd >= startKey;
  });

  const dayCounts = dateKeys.map((dateKey) => ({
    dateKey,
    count: uniqueActive(windowEvents, [dateKey]).length,
  }));
  const activeDays = dayCounts.filter((day) => day.count > 0).length;
  const busiest = dayCounts.reduce(
    (best, day) => (day.count > best.count ? day : best),
    dayCounts[0] || { dateKey: startKey, count: 0 },
  );
  const ongoingCount = events.filter(
    (event) => event.event_type === "ongoing" && eventActiveOn(event, startKey),
  ).length;

  return {
    days,
    eventCount: windowEvents.length,
    freeCount: windowEvents.filter((event) => event.is_free === true).length,
    activeDays,
    emptyDays: days - activeDays,
    ongoingCount,
    busiestDayLabel: formatDateKey(busiest.dateKey, lang),
    busiestDayCount: busiest.count,
  };
}
