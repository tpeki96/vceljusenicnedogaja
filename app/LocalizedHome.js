import EventExplorer from "./EventExplorer";
import { buildPeriods, buildStats, fetchUpcomingEvents } from "../lib/events";
import { getCopy, LANGUAGE_PATHS, LOCALES, SUPPORTED_LANGUAGES } from "../lib/i18n";

export const revalidate = 300;

function currentCeljeDate(lang) {
  const locale = LOCALES[lang] || LOCALES.sl;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Ljubljana",
  })
    .format(new Date())
    .toLocaleUpperCase(locale);
}

export default async function LocalizedHome({ lang = "sl" }) {
  const copy = getCopy(lang);
  const dateLabel = currentCeljeDate(lang);
  const events = await fetchUpcomingEvents(lang);
  const periods = buildPeriods(events, lang);
  const stats = buildStats(events, lang);
  const todayCount = periods.today.count;

  return (
    <main lang={lang}>
      <header className="site-header wrap">
        <a className="brand" href="#top" aria-label={copy.brand}>
          {copy.brand}
        </a>
        <div className="header-actions">
          <nav>
            <a href="#dogodki">{copy.nav.events}</a>
            <a href="#statistika">{copy.nav.stats}</a>
            <a href="#projekt">{copy.nav.project}</a>
          </nav>
          <div className="language-switcher" aria-label="Language / Jezik">
            {SUPPORTED_LANGUAGES.map((language) => (
              <a
                key={language}
                href={LANGUAGE_PATHS[language]}
                className={language === lang ? "active" : ""}
                aria-current={language === lang ? "page" : undefined}
                title={getCopy(language).languageName}
              >
                {language.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </header>

      <section className="hero wrap" id="top">
        <p className="eyebrow">{dateLabel}</p>
        <h1>
          {copy.hero.prefix}
          <br />
          <span>{copy.hero.strike}</span>{copy.hero.suffix}
        </h1>
        <div className="counter-row">
          <strong>{todayCount}</strong>
          <p>{copy.hero.count(todayCount)}</p>
        </div>
        <p className="demo-note">{copy.hero.note}</p>
      </section>

      <EventExplorer periods={periods} lang={lang} />

      <section className="stats-section" id="statistika">
        <div className="wrap">
          <div className="stats-head">
            <div>
              <p className="eyebrow">{copy.stats.eyebrow}</p>
              <h2>
                {copy.stats.title}
                <br />
                <span>{copy.stats.titleAccent}</span>
              </h2>
            </div>
            <p>{copy.stats.intro}</p>
          </div>

          <div className="stats-grid">
            <article>
              <strong>{stats.eventCount}</strong>
              <span>{copy.stats.eventCount}</span>
              <small>{copy.stats.eventCountSmall}</small>
            </article>
            <article>
              <strong>{stats.freeCount}</strong>
              <span>{copy.stats.freeCount}</span>
              <small>{copy.stats.freeCountSmall}</small>
            </article>
            <article>
              <strong>{stats.activeDays}</strong>
              <span>{copy.stats.activeDays}</span>
              <small>{copy.stats.activeDaysSmall(stats.days)}</small>
            </article>
            <article>
              <strong>{stats.emptyDays}</strong>
              <span>{copy.stats.emptyDays}</span>
              <small>{copy.stats.emptyDaysSmall}</small>
            </article>
          </div>

          <div className="stats-punchline">
            {copy.stats.busiest(stats.busiestDayLabel, stats.busiestDayCount)}
            {stats.ongoingCount > 0 && <> {copy.stats.ongoing(stats.ongoingCount)}</>}
          </div>

          <p className="stats-note">{copy.stats.note}</p>
        </div>
      </section>

      <section className="manifesto wrap" id="projekt">
        <p className="eyebrow">{copy.manifesto.eyebrow}</p>
        <h2>
          {copy.manifesto.line1}
          <br />
          {copy.manifesto.line2}
          <br />
          {copy.manifesto.line3Prefix}<span>{copy.manifesto.line3Strike}</span>
        </h2>
        <p className="manifesto-copy">{copy.manifesto.copy}</p>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <strong>vceljusenicnedogaja.si</strong>
          <span>{copy.footer}</span>
        </div>
      </footer>
    </main>
  );
}
