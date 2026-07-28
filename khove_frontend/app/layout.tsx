import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.khove.xyz"),
  title: "Khove — Your tools, finally thinking together",
  description:
    "AI-native platform connecting GitHub, Jira, and Google Calendar through a single conversational AI interface.",
  keywords: ["AI", "productivity", "GitHub", "Jira", "Google Calendar", "developer tools"],
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      >
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
