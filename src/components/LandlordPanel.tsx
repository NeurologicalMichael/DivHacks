"use client";

import { useState } from "react";
import { titleAddress } from "@/lib/format";
import type { Summary } from "@/lib/types";

export function LandlordPanel({
  options,
  selectedId,
  onSubmit,
}: {
  options: Summary[];
  selectedId: string | null;
  onSubmit: (input: { propertyId: string; windowMonths: number; note: string; email: string }) => Promise<string>;
}) {
  const [propertyId, setPropertyId] = useState(selectedId || options[0]?.id || "");
  const [windowMonths, setWindowMonths] = useState(6);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        setMessage("");
        try {
          setMessage(await onSubmit({ propertyId, windowMonths, note, email }));
          setNote("");
          setEmail("");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not save");
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="disclaimer">Landlords can privately signal that a storefront may become available. Entrepreneurs only see an anonymous line. Notes and email stay off the public record.</p>
      <label className="sub">Storefront</label>
      <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{titleAddress(option.address)} · {option.neighborhood}</option>
        ))}
      </select>
      <label className="sub">Possible window</label>
      <select value={windowMonths} onChange={(event) => setWindowMonths(Number(event.target.value))}>
        <option value={3}>Within 3 months</option>
        <option value={6}>Within 6 months</option>
        <option value={12}>Within 12 months</option>
      </select>
      <textarea rows={3} placeholder="Private note, never shown publicly" value={note} onChange={(event) => setNote(event.target.value)} />
      <input placeholder="Private email, never shown publicly" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button className="primary" type="submit" disabled={pending || !propertyId}>{pending ? "Saving…" : "Publish anonymous signal"}</button>
      {message && <p className="summary-note" style={{ margin: 0 }}>{message}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
