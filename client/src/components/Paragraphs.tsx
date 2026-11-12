// The website shows text as text: paragraphs split on blank lines, never as HTML.
export function Paragraphs({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (
        <p key={i} className={`whitespace-pre-line break-words ${className}`}>
          {p}
        </p>
      ))}
    </>
  );
}
