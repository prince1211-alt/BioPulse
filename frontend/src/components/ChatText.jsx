// Render model/user output as text nodes. Never interpret chat content as HTML.
export function ChatText({ text = '' }) {
  const bold = value => value.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  return <div className="space-y-1 text-sm text-foreground/90 leading-relaxed">{text.split('\n').map((line, i) => /^\s*[-*] /.test(line)
    ? <p key={i} className="ml-4">• {bold(line.replace(/^\s*[-*] /, ''))}</p>
    : <p key={i}>{bold(line) || '\u00a0'}</p>)}</div>;
}
