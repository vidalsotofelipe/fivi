import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";
import { LocaleProvider } from "@/components/LocaleProvider";
import { SyncProvider } from "@/components/SyncProvider";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { langInitScript } from "@/i18n/langScript";

export const metadata: Metadata = {
  title: "fivi — gastos compartidos",
  description:
    "Dividí gastos entre un grupo de personas. Rápida, mobile-first y funciona sin conexión.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "fivi",
  },
};

export const viewport: Viewport = {
  // Un único <meta name="theme-color"> que ThemeProvider/el script mutan según
  // el tema efectivo (Sistema / Claro / Oscuro).
  themeColor: "#ffffff",
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
        {/* Tema + idioma efectivos antes del primer paint (sin flash ni desajuste). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>
              <SyncProvider>{children}</SyncProvider>
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
