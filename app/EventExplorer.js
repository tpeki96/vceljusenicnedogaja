"use client";

import { useMemo, useState } from "react";

const INITIAL_LIMIT = 8;

function EventCard({ event }) {
  return (
    <a
      className="event-card"
      href={event.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${event.title} – odpri originalni dogodek`}
    >
      <div className="event-time">{event.time}</div>
      <div className="event-main">
        <h3>{event.title}</h3>
        <p>{event.venue}</p>
        <div className="tags">
          <span>{event.category}</span>
          {event.eventType === "multiday" && <span>Večdnevno</span>}
          {event.duration && <span>{event.duration}</span>}
          {event.free && <span className="free">Brezplačno</span>}
          {!event.free && event.price && <span>{event.price}</span>}
        </div>
      </div>
      <div className="event-arrow" aria-hidden="true">↗</div>
    </a>
  );
}

export default function EventExplorer({ periods }) {
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
            <p className="eyebrow">NO, PA POGLEJMO</p>
            <h2>{active.heading}</h2>
          </div>
          <div className="day-tabs" aria-label="Izbira obdobja">
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
                <EventCard key={event.id} event={event} />
              ))}
            </div>

            {active.events.length > INITIAL_LIMIT && (
              <button
                className="all-events"
                type="button"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Pokaži manj ↑" : `Pokaži vseh ${active.count} dogodkov ↓`}
              </button>
            )}
          </>
        ) : (
          <div className="empty-events">
            <strong>No, zdaj pa mogoče res nič.</strong>
            <span>Za izbrano obdobje trenutno nimamo najdenega dogodka.</span>
          </div>
        )}

        <p className="data-status">
          Podatki: <a href="https://www.cele.si" target="_blank" rel="noreferrer">V Celu dogaja</a>
          {" + "}<a href="https://www.celje.info/kam-v-celju/" target="_blank" rel="noreferrer">Celje.info</a>
          {" · "}samodejno osveževanje na 6 ur · podvojene objave združujemo.
        </p>
      </div>
    </section>
  );
}
