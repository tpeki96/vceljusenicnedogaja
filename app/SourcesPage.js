import styles from "./SourcesPage.module.css";

const SUPABASE_URL = "https://awyberrgkaaawxfgquvd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_49txmxFiwCggw-XyTFlssA_BthU47_o";

const COPY = {
  sl: {
    eyebrow: "PREGLED VIROV",
    title: "Od kod dobimo dogodke?",
    intro: "Dogodke samodejno zbiramo iz javno objavljenih koledarjev organizatorjev, prizorišč in lokalnih informacijskih portalov. Kadar isti dogodek najdemo večkrat, objave združimo in prednost damo neposrednemu viru organizatorja.",
    direct: "Neposredni viri organizatorjev",
    other: "Lokalni koledarji in agregatorji",
    directHint: "Podatke pridobivamo neposredno iz javnega koledarja ali podatkovnega vira organizatorja oziroma prizorišča.",
    otherHint: "Ti viri nam pomagajo odkriti dogodke, ki še niso zajeti pri neposrednih virih.",
    back: "← Nazaj na dogodke",
    note: "Seznam prikazuje trenutno aktivne vire in se samodejno spreminja skupaj s sistemom uvoza.",
    updated: "zadnja uspešna osvežitev",
    never: "še brez uspešne osvežitve",
    footer: "Celje, 2026 · eksperiment v nastajanju",
  },
  en: {
    eyebrow: "SOURCE OVERVIEW",
    title: "Where do the events come from?",
    intro: "We automatically collect events from publicly available calendars run by organisers, venues and local information services. When the same event appears more than once, we merge the listings and prefer the organiser's direct source.",
    direct: "Direct organiser sources",
    other: "Local calendars and aggregators",
    directHint: "Data comes directly from the public calendar or data feed of the organiser or venue.",
    otherHint: "These sources help us discover events not yet covered by direct sources.",
    back: "← Back to events",
    note: "This list shows the currently active sources and updates automatically with the import system.",
    updated: "last successful refresh",
    never: "not refreshed successfully yet",
    footer: "Celje, 2026 · an experiment in progress",
  },
  de: {
    eyebrow: "QUELLENÜBERSICHT",
    title: "Woher kommen die Veranstaltungen?",
    intro: "Wir sammeln Veranstaltungen automatisch aus öffentlich zugänglichen Kalendern von Veranstaltern, Spielstätten und lokalen Informationsdiensten. Mehrfach veröffentlichte Veranstaltungen werden zusammengeführt; bevorzugt wird die direkte Quelle des Veranstalters.",
    direct: "Direkte Veranstalterquellen",
    other: "Lokale Kalender und Aggregatoren",
    directHint: "Die Daten stammen direkt aus dem öffentlichen Kalender oder Datenfeed des Veranstalters bzw. der Spielstätte.",
    otherHint: "Diese Quellen helfen uns, Veranstaltungen zu entdecken, die noch nicht über direkte Quellen erfasst sind.",
    back: "← Zurück zu den Veranstaltungen",
    note: "Die Liste zeigt die derzeit aktiven Quellen und aktualisiert sich automatisch mit dem Importsystem.",
    updated: "letzte erfolgreiche Aktualisierung",
    never: "noch keine erfolgreiche Aktualisierung",
    footer: "Celje, 2026 · ein Experiment im Entstehen",
  },
  it: {
    eyebrow: "PANORAMICA DELLE FONTI",
    title: "Da dove arrivano gli eventi?",
    intro: "Raccogliamo automaticamente gli eventi dai calendari pubblici di organizzatori, sedi e servizi informativi locali. Quando lo stesso evento compare più volte, uniamo le pubblicazioni e diamo priorità alla fonte diretta dell'organizzatore.",
    direct: "Fonti dirette degli organizzatori",
    other: "Calendari locali e aggregatori",
    directHint: "I dati provengono direttamente dal calendario pubblico o dal feed dell'organizzatore o della sede.",
    otherHint: "Queste fonti ci aiutano a scoprire eventi non ancora coperti dalle fonti dirette.",
    back: "← Torna agli eventi",
    note: "L'elenco mostra le fonti attualmente attive e si aggiorna automaticamente con il sistema di importazione.",
    updated: "ultimo aggiornamento riuscito",
    never: "nessun aggiornamento riuscito finora",
    footer: "Celje, 2026 · un esperimento in corso",
  },
};

async function fetchSources() {
  const params = new URLSearchParams({
    select: "key,name,base_url,import_method,last_synced_at",
    active: "eq.true",
    order: "name.asc",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/sources?${params}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    next: { revalidate: 300 },
  });
  if (!response.ok) return [];
  return response.json();
}

function formatSynced(value, lang) {
  if (!value) return null;
  const locales = { sl: "sl-SI", en: "en-GB", de: "de-DE", it: "it-IT" };
  return new Intl.DateTimeFormat(locales[lang] || locales.sl, {
    timeZone: "Europe/Ljubljana",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function SourceList({ sources, lang, copy }) {
  return (
    <div className={styles.list}>
      {sources.map((source) => {
        const synced = formatSynced(source.last_synced_at, lang);
        return (
          <a className={styles.card} href={source.base_url} target="_blank" rel="noreferrer" key={source.key}>
            <div>
              <strong>{source.name}</strong>
              <span>{synced ? `${copy.updated}: ${synced}` : copy.never}</span>
            </div>
            <b aria-hidden="true">↗</b>
          </a>
        );
      })}
    </div>
  );
}

export default async function SourcesPage({ lang = "sl" }) {
  const copy = COPY[lang] || COPY.sl;
  const sources = await fetchSources();
  const direct = sources.filter((source) => source.import_method?.startsWith("direct_"));
  const other = sources.filter((source) => !source.import_method?.startsWith("direct_"));
  const home = lang === "sl" ? "/" : `/${lang}`;

  return (
    <main lang={lang}>
      <header className="site-header wrap">
        <a className="brand" href={home}>V CELJU SE NIČ NE DOGAJA.</a>
        <a className={styles.back} href={home}>{copy.back}</a>
      </header>

      <section className={`${styles.page} wrap`}>
        <div className={styles.hero}>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{copy.direct}</h2>
            <p>{copy.directHint}</p>
          </div>
          <SourceList sources={direct} lang={lang} copy={copy} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{copy.other}</h2>
            <p>{copy.otherHint}</p>
          </div>
          <SourceList sources={other} lang={lang} copy={copy} />
        </section>

        <p className={styles.note}>{copy.note}</p>
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
