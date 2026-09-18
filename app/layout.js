import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./i18n.css";

const SITE_URL = "https://vceljusenicnedogaja.si";
const DEFAULT_TITLE = "V Celju se nič ne dogaja";
const DEFAULT_DESCRIPTION =
  "Dogodki v Celju danes, jutri in ta vikend. Na enem mestu zbiramo koncerte, predstave, šport, razstave in druge dogodke v Celju.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  applicationName: DEFAULT_TITLE,
  category: "events",
  keywords: [
    "dogodki Celje",
    "Celje dogodki",
    "dogodki danes Celje",
    "dogodki ta vikend Celje",
    "koncerti Celje",
    "prireditve Celje",
    "kaj se dogaja v Celju",
  ],
  openGraph: {
    type: "website",
    locale: "sl_SI",
    url: SITE_URL,
    siteName: DEFAULT_TITLE,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="sl">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
