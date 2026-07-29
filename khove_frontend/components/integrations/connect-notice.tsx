import Link from "next/link";

/** Shown on a sub-tab when the integration isn't connected yet. */
export function ConnectNotice({ tool, href }: { tool: string; href: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
        <p className="text-[14px] text-white/60">{tool} isn&apos;t connected yet.</p>
        <Link href={href} className="mt-3 inline-block rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 py-2 text-[13px] text-white/80 hover:bg-white/[0.07]">
          Go to the {tool} dashboard
        </Link>
      </div>
    </div>
  );
}
