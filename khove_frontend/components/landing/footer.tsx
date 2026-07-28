import Link from "next/link";

/**
 * Footer — multi-column links + brand, in muted B&W. Structure follows the
 * common 21st.dev footer blocks (e.g. shadcnblocks footer-7), pared back to
 * Khove's tokens. Internal links point at the real auth routes; product/legal
 * links are anchors/placeholders until those pages exist.
 */
const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Integrations",
    links: [
      { label: "GitHub", href: "#features" },
      { label: "Google Calendar", href: "#features" },
      { label: "Jira", href: "#features" },
      { label: "Slack", href: "#features" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-ink/[0.06]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/assets/khove-white.png"
                alt="Khove"
                width={24}
                height={24}
                className="khove-mark h-6 w-6 object-contain"
              />
              <span className="text-[15px] font-semibold tracking-tight text-ink">
                Khove
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink/40">
              Your tools, finally thinking together.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-[12px] font-medium uppercase tracking-wider text-ink/40">
                {col.heading}
              </h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-ink/55 transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/[0.06] pt-6 sm:flex-row">
          <p className="text-[12px] text-ink/35">
            © {2026} Khove. All rights reserved.
          </p>
          <p className="text-[12px] text-ink/35">
            Built with an AI-native workspace.
          </p>
        </div>
      </div>
    </footer>
  );
}
