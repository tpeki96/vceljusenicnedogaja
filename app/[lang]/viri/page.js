import { notFound } from "next/navigation";
import SourcesPage from "../../SourcesPage";

const LANGUAGES = ["en", "de", "it"];

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const titles = {
    en: "Sources | Nothing happens in Celje",
    de: "Quellen | In Celje ist nichts los",
    it: "Fonti | A Celje non succede niente",
  };
  return { title: titles[lang] || titles.en };
}

export default async function LocalizedSourcesRoute({ params }) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang)) notFound();
  return <SourcesPage lang={lang} />;
}
