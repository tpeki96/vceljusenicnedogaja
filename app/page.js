const demoEvents = [
  {
    time: "17:00",
    title: "Odprtje razstave: Mesto v gibanju",
    venue: "Galerija sodobne umetnosti Celje",
    category: "Razstava",
    free: true,
  },
  {
    time: "18:00",
    title: "Poletni večer na terasi",
    venue: "Staro mestno jedro",
    category: "Druženje",
    free: true,
  },
  {
    time: "19:30",
    title: "Filmski večer pod zvezdami",
    venue: "Mestni park Celje",
    category: "Film",
    free: false,
  },
  {
    time: "20:00",
    title: "Koncert lokalnih bendov",
    venue: "Celjski mladinski center",
    category: "Glasba",
    free: true,
  },
  {
    time: "20:30",
    title: "Poletna predstava",
    venue: "Knežji dvor",
    category: "Gledališče",
    free: false,
  },
  {
    time: "21:00",
    title: "DJ večer",
    venue: "Center Celja",
    category: "Zabava",
    free: true,
  },
];

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

export default function Home() {
  return (
    <main>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label="V Celju se nič ne dogaja">
          V CELJU SE NIČ NE DOGAJA.
        </a>
        <nav>
          <a href="#dogodki">Dogodki</a>
          <a href="#projekt">O projektu</a>
          <button className="add-event">+ Dodaj dogodek</button>
        </nav>
      </header>

      <section className="hero wrap" id="top">
        <p className="eyebrow">NEDELJA, 16. AVGUST</p>
        <h1>
          V Celju se danes
          <br />
          <span>nič ne dogaja.</span>
        </h1>
        <div className="counter-row">
          <strong>18</strong>
          <p>
            dogodkov smo našli
            <br />
            samo za danes.
          </p>
        </div>
        <p className="demo-note">Zaenkrat demo podatki. Pravi dogodki pridejo v naslednji fazi.</p>
      </section>

      <section className="events-section" id="dogodki">
        <div className="wrap">
          <div className="section-head">
            <div>
              <p className="eyebrow">NO, PA POGLEJMO</p>
              <h2>Kaj se “ne dogaja” danes?</h2>
            </div>
            <div className="day-tabs" aria-label="Izbira dneva">
              <button className="active">Danes <b>18</b></button>
              <button>Jutri <b>14</b></button>
              <button>Vikend <b>42</b></button>
            </div>
          </div>

          <div className="event-list">
            {demoEvents.map((event) => (
              <EventCard key={`${event.time}-${event.title}`} event={event} />
            ))}
          </div>

          <button className="all-events">Pokaži vseh 18 dogodkov ↓</button>
        </div>
      </section>

      <section className="manifesto wrap" id="projekt">
        <p className="eyebrow">DRUŽBENI EKSPERIMENT</p>
        <h2>
          Koliko se mora dogajati,
          <br />
          da bomo nehali govoriti,
          <br />
          da se <span>nič ne dogaja?</span>
        </h2>
        <p className="manifesto-copy">
          Zbiramo javno objavljene dogodke v Celju in jih postavljamo na eno mesto.
          Ne zato, da bi naredili še en koledar, ampak da bi preverili lokalni mit.
        </p>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <strong>vceljusenicnedogaja.si</strong>
          <span>Celje, 2026 · eksperiment v nastajanju</span>
        </div>
      </footer>
    </main>
  );
}
