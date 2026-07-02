import type { Metadata } from "next";
import "./globals.css";
import { themeModes, themeStorageKey } from "@/lib/theme";

export const metadata: Metadata = {
  title: "FluxPost Studio",
  description: "Social media content production studio for crawl, rewrite, review, and Feishu publishing.",
};

const themeInitScript = `
(() => {
  try {
    const savedTheme = window.localStorage.getItem(${JSON.stringify(themeStorageKey)});
    const aliases = { light: "professional", dark: "creator" };
    const validThemes = ${JSON.stringify(themeModes)};
    const theme = aliases[savedTheme] || (validThemes.includes(savedTheme) ? savedTheme : "professional");
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "professional";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
