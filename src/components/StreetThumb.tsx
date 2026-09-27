"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export function StreetThumb({ id }: { id: string }) {
  const slot = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [credit, setCredit] = useState("");

  useEffect(() => {
    const node = slot.current;
    if (!node) return;
    let cancel = false;
    setSrc(null);
    setCredit("");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        apiFetch(`/api/streetview?id=${encodeURIComponent(id)}`)
          .then((response) => response.json())
          .then((payload: { available?: boolean; copyright?: string }) => {
            if (cancel || !payload.available) return;
            setCredit(payload.copyright || "© Mapillary contributors, CC BY-SA");
            setSrc(`/api/streetview/image?id=${encodeURIComponent(id)}`);
          })
          .catch(() => undefined);
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => {
      cancel = true;
      observer.disconnect();
    };
  }, [id]);

  return (
    <span ref={slot} className="thumb">
      {src ? (
        <img src={src} alt="" title={credit} onError={() => setSrc(null)} />
      ) : null}
    </span>
  );
}
