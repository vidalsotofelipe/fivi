import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";
import { SyncProvider } from "@/components/SyncProvider";

export const metadata: Metadata = {
  title: "fivi — gastos compartidos",
  description:
    "Dividí gastos entre un grupo de personas. Rápida, mobile-first y funciona sin conexión.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "fivi",
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
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
    <html lang="es">
      <body className="font-sans antialiased">
        <SyncProvider>{children}</SyncProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
