import { useState } from "react";

// The school logo is the file client/public/logo.svg (or logo.png: see LOGO_SRC). Replace that file to change it everywhere; no code changes.
// If the picture cannot load, a plain green badge with the initials is shown instead, so a broken-image icon never appears.
const LOGO_SRC = "/logo.svg";
const SCHOOL_NAME = "[School Name]";

export default function Logo({
  size = 40,
  showName = true,
  className = "",
}: {
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {failed ? (
        <span
          aria-hidden
          className="inline-flex items-center justify-center rounded-xl bg-brand-700 font-bold text-white"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          KK
        </span>
      ) : (
        // alt is empty when the name is printed next to it, so screen readers do not read the name twice
        <img
          src={LOGO_SRC}
          alt={showName ? "" : SCHOOL_NAME}
          width={size}
          height={size}
          className="shrink-0"
          onError={() => setFailed(true)}
        />
      )}
      {showName && (
        <span className="font-display text-lg font-bold leading-tight">
          {SCHOOL_NAME}
        </span>
      )}
    </span>
  );
}
