import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Préstamos · Core & CRM", template: "%s · Préstamos" },
  description: "Gestión de préstamos, cobranza en ruta, caja y mora",
};

export const viewport: Viewport = { themeColor: "#F8F7F4", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
