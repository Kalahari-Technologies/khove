import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Khove — Your tools, finally thinking together",
  description:
    "AI-native platform connecting GitHub, Jira, and Google Calendar through a single conversational AI interface.",
  keywords: ["AI", "productivity", "GitHub", "Jira", "Google Calendar", "developer tools"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
