"use client";

import { Fragment, type ReactNode, useMemo } from "react";

function renderInlineMarkdown(text: string): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return segments.map((seg, idx) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
      return <strong key={`md-inline-b-${idx}`}>{seg.slice(2, -2)}</strong>;
    }
    if (seg.startsWith("*") && seg.endsWith("*") && seg.length > 2) {
      return <em key={`md-inline-i-${idx}`}>{seg.slice(1, -1)}</em>;
    }
    return <Fragment key={`md-inline-t-${idx}`}>{seg}</Fragment>;
  });
}

type ParseResult = {
  node: ReactNode;
  nextIndex: number;
};

function parseHeadingBlock(lines: string[], index: number): ParseResult | null {
  const trimmed = lines[index].trim();
  const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (!heading) return null;

  const level = heading[1].length;
  const content = heading[2];
  const className =
    level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";

  return {
    node: (
      <div key={`md-h-${index}`} className={className}>
        {renderInlineMarkdown(content)}
      </div>
    ),
    nextIndex: index + 1,
  };
}

function parseQuoteBlock(lines: string[], index: number): ParseResult | null {
  const trimmed = lines[index].trim();
  if (!/^>\s+/.test(trimmed)) return null;

  const quoted: string[] = [];
  let i = index;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!/^>\s+/.test(line)) break;
    quoted.push(line.replace(/^>\s+/, ""));
    i += 1;
  }

  return {
    node: (
      <blockquote key={`md-q-${index}`} className="border-l-2 border-[#34516d] pl-2 text-[#c7d7e7]">
        {quoted.map((q, idx) => (
          <div key={`md-q-line-${idx}`}>{renderInlineMarkdown(q)}</div>
        ))}
      </blockquote>
    ),
    nextIndex: i,
  };
}

function parseListBlock(lines: string[], index: number): ParseResult | null {
  const trimmed = lines[index].trim();
  if (!/^[-*]\s+/.test(trimmed)) return null;

  const items: string[] = [];
  let i = index;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!/^[-*]\s+/.test(line)) break;
    items.push(line.replace(/^[-*]\s+/, ""));
    i += 1;
  }

  return {
    node: (
      <ul key={`md-ul-${index}`} className="list-disc space-y-1 pl-5">
        {items.map((item, idx) => (
          <li key={`md-li-${idx}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    ),
    nextIndex: i,
  };
}

function parseParagraphBlock(lines: string[], index: number): ParseResult {
  const para: string[] = [];
  let i = index;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || /^(#{1,6})\s+/.test(line) || /^>\s+/.test(line) || /^[-*]\s+/.test(line)) break;
    para.push(lines[i]);
    i += 1;
  }

  return {
    node: (
      <p key={`md-p-${index}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(para.join(" "))}
      </p>
    ),
    nextIndex: i,
  };
}

function parseBlock(lines: string[], index: number): ParseResult {
  const heading = parseHeadingBlock(lines, index);
  if (heading) return heading;
  const quote = parseQuoteBlock(lines, index);
  if (quote) return quote;
  const list = parseListBlock(lines, index);
  if (list) return list;
  return parseParagraphBlock(lines, index);
}

function renderMarkdownLite(md: string): ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    const parsed = parseBlock(lines, i);
    blocks.push(parsed.node);
    i = parsed.nextIndex;
  }

  if (blocks.length === 0) {
    return <div className="muted text-xs">Preview appears here.</div>;
  }
  return <div className="space-y-2">{blocks}</div>;
}

export default function MarkdownLitePreview({ markdown }: { markdown: string }) {
  const rendered = useMemo(() => renderMarkdownLite(markdown), [markdown]);
  return <div className="break-words">{rendered}</div>;
}
