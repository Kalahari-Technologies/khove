"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

/**
 * Renders content that may be Markdown OR HTML (e.g. Google Calendar descriptions
 * arrive as HTML; the weekly status report is Markdown). remark-gfm parses
 * Markdown, rehype-raw admits inline HTML, and rehype-sanitize strips anything
 * unsafe. One component for every rich-text surface.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 mb-2.5 marker:text-white/30">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 mb-2.5 marker:text-white/40">{children}</ol>,
  li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  b: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/90">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2 hover:text-sky-200 break-words">
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="font-semibold text-white text-[17px] leading-snug mt-4 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="font-semibold text-white text-[15px] leading-snug mt-3.5 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold text-white/95 text-[13.5px] mt-3 mb-1.5 first:mt-0">{children}</h3>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-white/20 pl-3 text-white/70 my-2.5 italic">{children}</blockquote>,
  hr: () => <hr className="border-white/[0.08] my-3" />,
  br: () => <br />,
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} text-[13px]`}>{children}</code>
    ) : (
      <code className="font-mono text-[12.5px] bg-white/[0.08] px-1.5 py-0.5 rounded text-sky-200/90">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 overflow-x-auto font-mono my-2.5 leading-relaxed">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2.5 rounded-xl border border-white/[0.09]">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-white/90 border-b border-white/[0.09]">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-white/[0.05] text-white/80 align-top">{children}</td>,
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
};

export function RichText({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
