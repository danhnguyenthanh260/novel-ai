import { Fragment, type ReactNode } from "react";

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

type BlockResult = {
  nextIndex: number;
  node: ReactNode;
} | null;

function consumeHeading(lines: string[], index: number): BlockResult {
  const trimmed = lines[index]?.trim() ?? "";
  const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (!heading) return null;
  const level = heading[1].length;
  const content = heading[2];
  const className =
    level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
  return {
    nextIndex: index + 1,
    node: (
      <div key={`md-h-${index}`} className={className}>
        {renderInlineMarkdown(content)}
      </div>
    ),
  };
}

function consumeQuote(lines: string[], index: number): BlockResult {
  const trimmed = lines[index]?.trim() ?? "";
  if (!/^>\s+/.test(trimmed)) return null;
  const quoted: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const current = lines[cursor].trim();
    if (!/^>\s+/.test(current)) break;
    quoted.push(current.replace(/^>\s+/, ""));
    cursor += 1;
  }
  return {
    nextIndex: cursor,
    node: (
      <blockquote key={`md-q-${index}`} className="border-l-2 border-[#34516d] pl-2 text-[#c7d7e7]">
        {quoted.map((q, idx) => (
          <div key={`md-q-line-${idx}`}>{renderInlineMarkdown(q)}</div>
        ))}
      </blockquote>
    ),
  };
}

function consumeList(lines: string[], index: number): BlockResult {
  const trimmed = lines[index]?.trim() ?? "";
  if (!/^[-*]\s+/.test(trimmed)) return null;
  const items: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const current = lines[cursor].trim();
    if (!/^[-*]\s+/.test(current)) break;
    items.push(current.replace(/^[-*]\s+/, ""));
    cursor += 1;
  }
  return {
    nextIndex: cursor,
    node: (
      <ul key={`md-ul-${index}`} className="list-disc space-y-1 pl-5">
        {items.map((item, idx) => (
          <li key={`md-li-${idx}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    ),
  };
}

function consumeParagraph(lines: string[], index: number): BlockResult {
  const trimmed = lines[index]?.trim() ?? "";
  if (!trimmed) return null;
  const para: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const current = lines[cursor].trim();
    if (!current || /^(#{1,6})\s+/.test(current) || /^>\s+/.test(current) || /^[-*]\s+/.test(current)) break;
    para.push(lines[cursor]);
    cursor += 1;
  }
  return {
    nextIndex: cursor,
    node: (
      <p key={`md-p-${index}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(para.join(" "))}
      </p>
    ),
  };
}

export function renderMarkdownLite(md: string): ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const block =
      consumeHeading(lines, index) ??
      consumeQuote(lines, index) ??
      consumeList(lines, index) ??
      consumeParagraph(lines, index);
    if (!block) {
      index += 1;
      continue;
    }
    blocks.push(block.node);
    index = block.nextIndex;
  }

  if (blocks.length === 0) {
    return <div className="muted text-xs">Preview appears here.</div>;
  }
  return <div className="space-y-2">{blocks}</div>;
}
