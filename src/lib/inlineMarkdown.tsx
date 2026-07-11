import { Fragment, type ReactNode } from 'react';

/**
 * Minimal inline markdown renderer for marketing copy.
 * Supports **bold** and *italic* (non-nested). Everything else renders as text.
 */
export function renderInlineMarkdown(text: string): ReactNode {
  if (!text) return text;
  // Tokenize on **...** and *...* while keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Strip inline markdown delimiters for plain-text contexts (JSON-LD, meta). */
export function stripInlineMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}
