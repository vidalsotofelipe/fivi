import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SyncProvider } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "fivi — gastos compartidos",
  description:
    "Dividí gastos entre un grupo de personas. Rápida, mobile-first y funciona sin conexión.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "fivi",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1111" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <LocaleProvider>
          <ToastProvider>
            <SyncProvider>{children}</SyncProvider>
          </ToastProvider>
        </LocaleProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
