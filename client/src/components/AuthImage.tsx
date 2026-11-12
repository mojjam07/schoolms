import { useEffect, useState } from "react";
import { fetchFileBlob } from "../lib/api";

// Shows a picture that is not public yet (a draft), fetched with the administrator's sign-in.
export function AuthImage({
  fileId,
  alt,
  className = "",
}: {
  fileId: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let cancelled = false;
    fetchFileBlob(fileId)
      .then((b) => {
        if (!cancelled) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);
  return src ? (
    <img src={src} alt={alt} className={className} />
  ) : (
    <div className={`${className} bg-brand-50`} aria-hidden />
  );
}
