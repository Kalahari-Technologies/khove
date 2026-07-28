import Link from "next/link";

/**
 * Shared shell + typographic primitives for the legal pages (Terms, Privacy).
 * Self-contained dark theme (matches the auth screens) so it renders correctly
 * regardless of the landing page's light/dark toggle.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#09090B]/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/assets/khove-white.png"
              alt="Khove"
              width={22}
              height={22}
              className="h-[22px] w-[22px] object-contain"
            />
            <span className="text-[15px] font-semibold tracking-tight">Khove</span>
          </Link>
          <Link
            href="/"
            className="text-[13px] text-white/50 transition-colors hover:text-white"
          >
            &larr; Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[13px] text-white/40">Last updated: {updated}</p>

        <div className="mt-10 flex flex-col gap-2">{children}</div>

        {/* Footer */}
        <div className="mt-16 flex items-center gap-5 border-t border-white/[0.08] pt-6 text-[13px] text-white/40">
          <Link href="/terms" className="transition-colors hover:text-white">
            Terms &amp; Conditions
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-white">
            Privacy Policy
          </Link>
          <span className="ml-auto text-white/30">© 2026 Khove</span>
        </div>
      </main>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-[18px] font-semibold text-white">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-relaxed text-white/60">{children}</p>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc text-[14px] leading-relaxed text-white/60 marker:text-white/30">
          {item}
        </li>
      ))}
    </ul>
  );
}
