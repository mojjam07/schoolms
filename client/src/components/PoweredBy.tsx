// "Powered by CyberSpark IT Solutions", linked to the developer's website. Used in every footer.
export default function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-muted ${className}`}>
      Designed by{" "}
      <a
        href="https://www.cybersparkit.site"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-700 underline underline-offset-2 hover:no-underline"
      >
        CyberSpark IT Solutions
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
