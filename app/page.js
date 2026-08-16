import EventExplorer from "./EventExplorer";

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

export default function Home() {
  const dateLabel = currentCeljeDate();

  return (
    <main>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label="V Celju se nič ne dogaja">
          V CELJU SE NIČ NE DOGAJA.
        </a>
        <nav>
          <a href="#dogodki">Dogodki</a>
          <a href="#projekt">O projektu</a>
          <button className="add-event" type="button">+ Dodaj dogodek</button>
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
          <strong>18</strong>
          <p>
            dogodkov smo našli
            <br />
            samo za danes.
          </p>
        </div>
        <p className="demo-note">Zaenkrat demo podatki. Pravi dogodki pridejo v naslednji fazi.</p>
      </section>

      <EventExplorer />

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
