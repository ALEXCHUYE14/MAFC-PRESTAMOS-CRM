import type { MetadataRoute } from "next";

/**
 * Manifiesto web: ícono y nombre al "Agregar a la pantalla de inicio" en Android.
 * display "browser": se abre como un acceso directo normal del navegador (misma sesión,
 * mismos enlaces de WhatsApp), sin cambiar el comportamiento del sistema.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wally Préstamos",
    short_name: "Wally",
    description: "Gestión de préstamos, cobranza en ruta, caja y mora",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#F8F7F4",
    theme_color: "#1E3F32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
