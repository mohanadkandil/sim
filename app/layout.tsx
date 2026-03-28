import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ActivityProvider } from "@/lib/activity-context";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Crucible | Staging Environment for Product Decisions",
  description:
    "Put your roadmap through the fire. Test product decisions on your real user population before shipping.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${geist.variable} ${spaceMono.variable} antialiased`}>
        <ActivityProvider>{children}</ActivityProvider>
      </body>
    </html>
  );
}
