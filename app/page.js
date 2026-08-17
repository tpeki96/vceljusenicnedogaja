import EventExplorer from "./EventExplorer";
import { buildPeriods, buildStats, fetchUpcomingEvents } from "../lib/events";

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
  const stats = buildStats(events);
  const todayCount = periods.today.count;

  return (
    <main>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label="V Celju se nič ne dogaja">
          V CELJU SE NIČ NE DOGAJA.
        </a>
        <nav>
          <a href="#dogodki">Dogodki</a>
          <a href="#statistika">Statistika</a>
          <a href="#projekt">O projektu</a>
        </nav>
      </header>

      <section className="hero wrap" id="top">
        <p className="eyebrow">{dateLabel}</p>
        <h1>
          V Celju se danes
          <br />
          <span>nič ne</span> dogaja.
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
          Glavni števec vključuje enkratne in aktivne večdnevne dogodke. Dolgotrajne razstave in programe vodimo ločeno pod »V teku«.
        </p>
      </section>

      <EventExplorer periods={periods} />

      <section className="stats-section" id="statistika">
        <div className="wrap">
          <div className="stats-head">
            <div>
              <p className="eyebrow">ŠTEJMO, ČE ŽE GOVORIMO</p>
              <h2>
                Naslednjih 30 dni.
                <br />
                <span>Po naših virih.</span>
              </h2>
            </div>
            <p>
              Živi prerez trenutno zajetih podatkov. Številke se samodejno osvežujejo skupaj z dogodki.
            </p>
          </div>

          <div className="stats-grid">
            <article>
              <strong>{stats.eventCount}</strong>
              <span>različnih dogodkov</span>
              <small>enkratnih in večdnevnih</small>
            </article>
            <article>
              <strong>{stats.freeCount}</strong>
              <span>potrjeno brezplačnih</span>
              <small>med dogodki v tem obdobju</small>
            </article>
            <article>
              <strong>{stats.activeDays}</strong>
              <span>dni, ko se nekaj dogaja</span>
              <small>od naslednjih {stats.days} dni</small>
            </article>
            <article>
              <strong>{stats.emptyDays}</strong>
              <span>dni brez najdenega dogodka</span>
              <small>po trenutno zajetih virih</small>
            </article>
          </div>

          <div className="stats-punchline">
            Najbolj nabit dan trenutno: <strong>{stats.busiestDayLabel}</strong> — {stats.busiestDayCount} {eventWord(stats.busiestDayCount)}.
            {stats.ongoingCount > 0 && (
              <> Poleg tega je danes v teku še {stats.ongoingCount} dolgotrajnih razstav ali programov.</>
            )}
          </div>

          <p className="stats-note">
            Statistika temelji na javno objavljenih podatkih virov V Celu dogaja, Celje.info in Visit Celje. Ne predstavlja uradne ali popolne evidence vseh dogodkov v Celju.
          </p>
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
