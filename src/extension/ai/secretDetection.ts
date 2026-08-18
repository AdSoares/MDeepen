export interface Secret {
  kind: string;
  index: number;
  length: number;
}

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'api-key', re: /sk-[A-Za-z0-9_-]{16,}/g },
  { kind: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  { kind: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'bearer', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

export function detectSecrets(text: string): Secret[] {
  const found: Secret[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ kind, index: m.index, length: m[0].length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function maskSecrets(text: string): string {
  const secrets = detectSecrets(text);
  if (secrets.length === 0) return text;
  // Replace from the end so earlier indices stay valid.
  let out = text;
  for (const s of [...secrets].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, s.index) + '\u2039redacted\u203a' + out.slice(s.index + s.length);
  }
  return out;
}
