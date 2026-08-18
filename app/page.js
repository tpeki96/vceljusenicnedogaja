import LocalizedHome from "./LocalizedHome";
import { getCopy } from "../lib/i18n";

const copy = getCopy("sl");

export const metadata = {
  title: copy.metaTitle,
  description: copy.metaDescription,
  alternates: {
    canonical: "https://vceljusenicnedogaja.si/",
    languages: {
      "sl-SI": "https://vceljusenicnedogaja.si/",
      en: "https://vceljusenicnedogaja.si/en",
      de: "https://vceljusenicnedogaja.si/de",
      it: "https://vceljusenicnedogaja.si/it",
    },
  },
};

export default function Home() {
  return <LocalizedHome lang="sl" />;
}
