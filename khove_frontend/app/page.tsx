import { Landing } from "@/components/landing/landing";

// The landing page renders for everyone — signed-in or not. It never redirects
// into the app; that only happens on the auth routes (/login, /join) via the
// middleware, and on the /home resolver. This lets logged-in users browse the
// marketing site (footer, legal pages) without being bounced away.
export default function RootPage() {
  return <Landing />;
}
