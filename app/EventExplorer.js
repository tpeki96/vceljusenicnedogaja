"use client";

import { useState } from "react";

const periods = {
  today: {
    label: "Danes",
    count: 18,
    heading: "Kaj se “ne dogaja” danes?",
    events: [
      { time: "17:00", title: "Odprtje razstave: Mesto v gibanju", venue: "Galerija sodobne umetnosti Celje", category: "Razstava", free: true },
      { time: "18:00", title: "Poletni večer na terasi", venue: "Staro mestno jedro", category: "Druženje", free: true },
      { time: "19:30", title: "Filmski večer pod zvezdami", venue: "Mestni park Celje", category: "Film", free: false },
      { time: "20:00", title: "Koncert lokalnih bendov", venue: "Celjski mladinski center", category: "Glasba", free: true },
      { time: "20:30", title: "Poletna predstava", venue: "Knežji dvor", category: "Gledališče", free: false },
      { time: "21:00", title: "DJ večer", venue: "Center Celja", category: "Zabava", free: true },
    ],
  },
  tomorrow: {
    label: "Jutri",
    count: 14,
    heading: "Kaj se “ne dogaja” jutri?",
    events: [
      { time: "10:00", title: "Dopoldanska ustvarjalnica", venue: "Center Celja", category: "Delavnica", free: true },
      { time: "17:30", title: "Vodeni sprehod skozi mesto", venue: "Krekov trg", category: "Doživetje", free: false },
      { time: "18:00", title: "Odprti trening", venue: "Mestni park Celje", category: "Šport", free: true },
      { time: "19:00", title: "Pogovor z ustvarjalci", venue: "Celjski mladinski center", category: "Pogovor", free: true },
      { time: "20:00", title: "Večer akustične glasbe", venue: "Staro mestno jedro", category: "Glasba", free: false },
    ],
  },
  weekend: {
    label: "Vikend",
    count: 42,
    heading: "Kaj se “ne dogaja” ta vikend?",
    events: [
      { time: "09:00", title: "Sobotni mestni utrip", venue: "Glavni trg", category: "Mesto", free: true },
      { time: "11:00", title: "Program za otroke", venue: "Mestni park Celje", category: "Otroci", free: true },
      { time: "17:00", title: "Popoldanski koncert", venue: "Staro mestno jedro", category: "Glasba", free: true },
      { time: "19:00", title: "Predstava na prostem", venue: "Knežji dvor", category: "Gledališče", free: false },
      { time: "20:30", title: "Večerni program", venue: "Celjski mladinski center", category: "Dogodek", free: true },
      { time: "22:00", title: "Nočni DJ set", venue: "Center Celja", category: "Zabava", free: false },
    ],
  },
};

function EventCard({ event }) {
  return (
    <article className="event-card">
      <div className="event-time">{event.time}</div>
      <div className="event-main">
        <h3>{event.title}</h3>
        <p>{event.venue}</p>
        <div className="tags">
          <span>{event.category}</span>
          {event.free && <span className="free">Brezplačno</span>}
        </div>
      </div>
      <div className="event-arrow" aria-hidden="true">↗</div>
    </article>
  );
}

export default function EventExplorer() {
  const [activeKey, setActiveKey] = useState("today");
  const active = periods[activeKey];

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
                onClick={() => setActiveKey(key)}
              >
                {period.label} <b>{period.count}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="event-list">
          {active.events.map((event) => (
            <EventCard key={`${activeKey}-${event.time}-${event.title}`} event={event} />
          ))}
        </div>

        <p className="data-status">
          Demo prikaz · po priklopu virov bo tukaj vseh {active.count} dogodkov.
        </p>
      </div>
    </section>
  );
}
