// Boolean search parser & evaluator for candidate search.
// Supports: AND, OR, NOT, quoted phrases, parenthesised groups.
// Default operator between adjacent terms is AND.

export type BoolNode =
  | { type: "term"; value: string }
  | { type: "not"; child: BoolNode }
  | { type: "and"; children: BoolNode[] }
  | { type: "or"; children: BoolNode[] };

type Token =
  | { kind: "AND" | "OR" | "NOT" | "LPAREN" | "RPAREN" }
  | { kind: "TERM"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(") { tokens.push({ kind: "LPAREN" }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "RPAREN" }); i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      let buf = "";
      while (j < s.length && s[j] !== '"') { buf += s[j]; j++; }
      i = j < s.length ? j + 1 : j;
      if (buf) tokens.push({ kind: "TERM", value: buf });
      continue;
    }
    // Bare word
    let j = i;
    let buf = "";
    while (j < s.length && !/\s|\(|\)/.test(s[j]) && s[j] !== '"') { buf += s[j]; j++; }
    i = j;
    const upper = buf.toUpperCase();
    if (upper === "AND") tokens.push({ kind: "AND" });
    else if (upper === "OR") tokens.push({ kind: "OR" });
    else if (upper === "NOT") tokens.push({ kind: "NOT" });
    else if (buf) tokens.push({ kind: "TERM", value: buf });
  }
  return tokens;
}

// Recursive descent: OR > AND > NOT > primary
export function parseBoolean(input: string): BoolNode | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  const parsePrimary = (): BoolNode | null => {
    const t = peek();
    if (!t) return null;
    if (t.kind === "LPAREN") {
      eat();
      const node = parseOr();
      if (peek()?.kind === "RPAREN") eat();
      return node;
    }
    if (t.kind === "NOT") { eat(); const child = parsePrimary(); return child ? { type: "not", child } : null; }
    if (t.kind === "TERM") { eat(); return { type: "term", value: t.value }; }
    // Stray operator / rparen — skip
    eat();
    return parsePrimary();
  };

  const parseAnd = (): BoolNode | null => {
    const children: BoolNode[] = [];
    const first = parsePrimary();
    if (first) children.push(first);
    while (true) {
      const t = peek();
      if (!t) break;
      if (t.kind === "OR" || t.kind === "RPAREN") break;
      if (t.kind === "AND") { eat(); }
      const next = parsePrimary();
      if (!next) break;
      children.push(next);
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { type: "and", children };
  };

  const parseOr = (): BoolNode | null => {
    const children: BoolNode[] = [];
    const first = parseAnd();
    if (first) children.push(first);
    while (peek()?.kind === "OR") {
      eat();
      const next = parseAnd();
      if (next) children.push(next);
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { type: "or", children };
  };

  return parseOr();
}

export function evaluate(node: BoolNode | null, haystack: string): boolean {
  if (!node) return true;
  const hay = haystack.toLowerCase();
  const walk = (n: BoolNode): boolean => {
    switch (n.type) {
      case "term": return hay.includes(n.value.toLowerCase());
      case "not": return !walk(n.child);
      case "and": return n.children.every(walk);
      case "or": return n.children.some(walk);
    }
  };
  return walk(node);
}

// Positive terms only, for highlighting (skip anything inside a NOT).
export function collectPositiveTerms(node: BoolNode | null, negated = false, out: string[] = []): string[] {
  if (!node) return out;
  switch (node.type) {
    case "term": if (!negated) out.push(node.value); break;
    case "not": collectPositiveTerms(node.child, !negated, out); break;
    case "and":
    case "or": for (const c of node.children) collectPositiveTerms(c, negated, out); break;
  }
  return out;
}

// Return unique, non-empty positive search terms for a given query.
export function positiveTermsFor(query: string): string[] {
  const ast = parseBoolean(query);
  const terms = collectPositiveTerms(ast).map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set(terms));
}

// Extract snippets around each positive term hit in a body of text.
export function extractSnippets(text: string, terms: string[], max = 5, radius = 80): string[] {
  if (!text || terms.length === 0) return [];
  const lower = text.toLowerCase();
  const snippets: string[] = [];
  const seen = new Set<number>();
  for (const term of terms) {
    const q = term.toLowerCase();
    let from = 0;
    while (snippets.length < max) {
      const idx = lower.indexOf(q, from);
      if (idx === -1) break;
      const start = Math.max(0, idx - radius);
      const end = Math.min(text.length, idx + q.length + radius);
      if (!seen.has(start)) {
        seen.add(start);
        const prefix = start > 0 ? "…" : "";
        const suffix = end < text.length ? "…" : "";
        snippets.push(`${prefix}${text.slice(start, end)}${suffix}`);
      }
      from = idx + q.length;
    }
    if (snippets.length >= max) break;
  }
  return snippets;
}
