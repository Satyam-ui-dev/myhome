import "./globals.css";
import SiteNav from "./components/SiteNav";

export const metadata = {
  title: "Home Control",
  description: "ESP32 home automation controls and device analysis"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
