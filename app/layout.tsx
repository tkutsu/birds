import type { Metadata } from "next";
import "./globals.css";

const themeInitializationScript = `
  (() => {
    let theme = "dark";
    try {
      const storedTheme = window.localStorage.getItem("birds-theme");
      theme = storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    } catch {
      theme = window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
    document.documentElement.dataset.theme = theme;
  })();
`;

export const metadata: Metadata = {
  title: "Bird Migration Radar",
  description:
    "Animated map of nocturnal bird migration over Europe, built from weather-radar bird density profiles published by Aloft (ENRAM).",
  applicationName: "Bird Migration Radar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
