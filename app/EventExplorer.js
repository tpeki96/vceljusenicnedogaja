"use client";

import { useMemo, useState } from "react";
import { getCopy } from "../lib/i18n";

const INITIAL_LIMIT = 8;
const SOURCE_COPY = {
  sl: { description: "javno objavljeni koledarji organizatorjev in lokalni viri", link: "Viri in način zbiranja" },
  en: { description: "public event calendars from organisers and local sources", link: "Sources and collection method" },
  de: { description: "öffentliche Veranstaltungskalender von Veranstaltern und lokale Quellen", link: "Quellen und Datenerfassung" },
  it: { description: "calendari pubblici degli organizzatori e fonti locali", link: "Fonti e metodo di raccolta" },
};
const ALL_DAY_COPY = { sl: "VES DAN", en: "ALL DAY", de: "GANZTÄGIG", it: "TUTTO IL GIORNO" };
const MORE_COPY = {
  sl: { more: (count) => `Še ${count} dogodkov`, show: "Prikaži vse", less: "Prikaži manj" },
  en: { more: (count) => `${count} more events`, show: "Show all", less: "Show less" },
  de: { more: (count) => `Noch ${count} Veranstaltungen`, show: "Alle anzeigen", less: "Weniger anzeigen" },
  it: { more: (count) => `Altri ${count} eventi`, show: "Mostra tutti", less: "Mostra meno" },
};

function displayText(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ");
}

function EventCard({ event, copy, lang }) {
  const shownTime = event.eventType === "single" && event.time === "00:00"
    ? (ALL_DAY_COPY[lang] || ALL_DAY_COPY.sl)
    : event.time;
  const shownTitle = displayText(event.title);
  const shownVenue = displayText(event.venue);

  return (
    <a
      className="event-card"
      href={event.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${shownTitle} – ${copy.openOriginal}`}
    >
      <div className="event-time">{shownTime}</div>
      <div className="event-main">
        <h3>{shownTitle}</h3>
        <p>{shownVenue}</p>
        <div className="tags">
          <span>{displayText(event.category)}</span>
          {event.eventType === "multiday" && <span>{copy.multiDay}</span>}
          {event.duration && <span>{event.duration}</span>}
          {event.free && <span className="free">{copy.free}</span>}
          {!event.free && event.price && <span>{displayText(event.price)}</span>}
        </div>
      </div>
      <div className="event-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </div>
    </a>
  );
}

export default function EventExplorer({ periods, lang = "sl" }) {
  const copy = getCopy(lang).events;
  const sourceCopy = SOURCE_COPY[lang] || SOURCE_COPY.sl;
  const moreCopy = MORE_COPY[lang] || MORE_COPY.sl;
  const sourcesHref = lang === "sl" ? "/viri" : `/${lang}/viri`;
  const [activeKey, setActiveKey] = useState("today");
  const [expanded, setExpanded] = useState(false);
  const active = periods[activeKey];
  const remainingCount = Math.max(0, active.events.length - INITIAL_LIMIT);

  const visibleEvents = useMemo(
    () => (expanded ? active.events : active.events.slice(0, INITIAL_LIMIT)),
    [active.events, expanded],
  );

  function choosePeriod(key) {
    setActiveKey(key);
    setExpanded(false);
  }

  return (
    <section className="events-section" id="dogodki">
      <div className="wrap">
        <div className="section-head">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{active.heading}</h2>
          </div>
          <div className="day-tabs" aria-label={copy.tabsAria}>
            {Object.entries(periods).map(([key, period]) => (
              <button
                key={key}
                type="button"
                className={key === activeKey ? "active" : ""}
                aria-pressed={key === activeKey}
                onClick={() => choosePeriod(key)}
              >
                {period.label} <b>{period.count}</b>
              </button>
            ))}
          </div>
        </div>

        {active.events.length > 0 ? (
          <>
            <div className="event-list">
              {visibleEvents.map((event) => (
                <EventCard key={event.id} event={event} copy={copy} lang={lang} />
              ))}
            </div>

            {active.events.length > INITIAL_LIMIT && (
              <div className={`more-events-wrap${expanded ? " expanded" : ""}`}>
                <button
                  className="all-events"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {!expanded && <span className="all-events-count">{moreCopy.more(remainingCount)}</span>}
                  <span className="all-events-action">
                    {expanded ? moreCopy.less : moreCopy.show}
                    <span className="all-events-arrow" aria-hidden="true">{expanded ? "↑" : "↓"}</span>
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-events">
            <strong>{copy.emptyTitle}</strong>
            <span>{copy.emptyText}</span>
          </div>
        )}

        <p className="data-status">
          {copy.dataPrefix} {sourceCopy.description}
          {" · "}<a href={sourcesHref}>{sourceCopy.link}</a>
          {" · "}{copy.dataSuffix}
        </p>
      </div>
    </section>
  );
}
