import EventExplorer from "./EventExplorer";
import { buildPeriods, fetchUpcomingEvents } from "../lib/events";

export const revalidate = 300;

function currentCeljeDate() {
  return new Intl.DateTimeFormat("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Ljubljana",
  })
    .format(new Date())
    .toLocaleUpperCase("sl-SI");
}

function eventWord(count) {
  if (count === 1) return "dogodek";
  if (count === 2) return "dogodka";
  if (count === 3 || count === 4) return "dogodke";
  return "dogodkov";
}

export default async function Home() {
  const dateLabel = currentCeljeDate();
  const events = await fetchUpcomingEvents();
  const periods = buildPeriods(events);
  const todayCount = periods.today.count;

  return (
    <main>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label="V Celju se nič ne dogaja">
          V CELJU SE NIČ NE DOGAJA.
        </a>
        <nav>
          <a href="#dogodki">Dogodki</a>
          <a href="#projekt">O projektu</a>
          <a
            className="add-event"
            href="https://www.cele.si/dodaj-dogodek/"
            target="_blank"
            rel="noreferrer"
          >
            + Dodaj dogodek
          </a>
        </nav>
      </header>

      <section className="hero wrap" id="top">
        <p className="eyebrow">{dateLabel}</p>
        <h1>
          V Celju se danes
          <br />
          <span>nič ne dogaja.</span>
        </h1>
        <div className="counter-row">
          <strong>{todayCount}</strong>
          <p>
            {eventWord(todayCount)} smo našli
            <br />
            samo za danes.
          </p>
        </div>
        <p className="demo-note">
          Štejemo javno objavljene dogodke. Če česa še ni na seznamu, to ne pomeni, da se ne dogaja.
        </p>
      </section>

      <EventExplorer periods={periods} />

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
