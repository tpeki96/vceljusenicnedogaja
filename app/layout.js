import "./globals.css";
import "./i18n.css";

export const metadata = {
  title: "V Celju se nič ne dogaja",
  description: "Družbeni eksperiment in pregled dogodkov v Celju.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="sl">
      <body>{children}</body>
    </html>
  );
}
