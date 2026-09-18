export default function SeoSchema({ lang = "sl" }) {
  const names = {
    sl: "V Celju se nič ne dogaja",
    en: "Nothing happens in Celje",
    de: "In Celje ist nichts los",
    it: "A Celje non succede niente",
  };

  const descriptions = {
    sl: "Pregled dogodkov v Celju danes, jutri in ta vikend.",
    en: "A live overview of events in Celje today, tomorrow and this weekend.",
    de: "Aktueller Überblick über Veranstaltungen in Celje heute, morgen und am Wochenende.",
    it: "Panoramica aggiornata degli eventi a Celje oggi, domani e nel weekend.",
  };

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: names[lang] || names.sl,
    url:
      lang === "sl"
        ? "https://vceljusenicnedogaja.si/"
        : `https://vceljusenicnedogaja.si/${lang}`,
    description: descriptions[lang] || descriptions.sl,
    inLanguage: lang === "sl" ? "sl-SI" : lang,
    about: {
      "@type": "City",
      name: "Celje",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Celje",
        addressCountry: "SI",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
