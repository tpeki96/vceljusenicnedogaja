import { notFound } from "next/navigation";
import LocalizedHome from "../LocalizedHome";
import { getCopy } from "../../lib/i18n";

const LANGUAGES = ["en", "de", "it"];

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang)) return {};
  const copy = getCopy(lang);

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: {
      canonical: `https://vceljusenicnedogaja.si/${lang}`,
      languages: {
        "sl-SI": "https://vceljusenicnedogaja.si/",
        en: "https://vceljusenicnedogaja.si/en",
        de: "https://vceljusenicnedogaja.si/de",
        it: "https://vceljusenicnedogaja.si/it",
      },
    },
  };
}

export default async function LanguageHome({ params }) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang)) notFound();
  return <LocalizedHome lang={lang} />;
}
