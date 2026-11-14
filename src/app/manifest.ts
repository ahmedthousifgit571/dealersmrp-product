import type { MetadataRoute } from "next";

/** Install as an app on phones and desktops (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ElectroPrice: dealer price & MRP",
    short_name: "ElectroPrice",
    description: "Find dealer price and MRP in seconds. Keep prices current from supplier invoices.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Scan a barcode", short_name: "Scan", url: "/?scan=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Scan an invoice", short_name: "Invoice", url: "/invoices/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
