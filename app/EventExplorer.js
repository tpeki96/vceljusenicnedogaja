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

function EventCard({ event, copy }) {
  return (
    <a
      className="event-card"
      href={event.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${event.title} – ${copy.openOriginal}`}
    >
      <div className="event-time">{event.time}</div>
      <div className="event-main">
        <h3>{event.title}</h3>
        <p>{event.venue}</p>
        <div className="tags">
          <span>{event.category}</span>
          {event.eventType === "multiday" && <span>{copy.multiDay}</span>}
          {event.duration && <span>{event.duration}</span>}
          {event.free && <span className="free">{copy.free}</span>}
          {!event.free && event.price && <span>{event.price}</span>}
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
  const sourcesHref = lang === "sl" ? "/viri" : `/${lang}/viri`;
  const [activeKey, setActiveKey] = useState("today");
  const [expanded, setExpanded] = useState(false);
  const active = periods[activeKey];

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
                <EventCard key={event.id} event={event} copy={copy} />
              ))}
            </div>

            {active.events.length > INITIAL_LIMIT && (
              <button
                className="all-events"
                type="button"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? copy.showLess : copy.showAll(active.count)}
              </button>
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
