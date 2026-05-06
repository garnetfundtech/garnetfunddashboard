import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import "@fontsource-variable/dm-sans";

export const metadata: Metadata = {
  title: "Garnet Fund Dashboard",
  description: "Private portfolio and research dashboard for USC Garnet Fund",
  icons: {
    icon: [{ url: "/Garnet%20Fund%20Icon.png" }],
    apple: [{ url: "/Garnet%20Fund%20Icon.png" }],
    shortcut: [{ url: "/Garnet%20Fund%20Icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("dark h-full antialiased", "font-sans")}
    >
      <body className="min-h-full bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
