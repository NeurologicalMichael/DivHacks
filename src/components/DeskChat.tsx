"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DeskAccount, DeskDraft, DeskEvent } from "@/lib/desk";
import type { Summary } from "@/lib/types";

const ACCOUNT_KEY = "leaselens-desk-account";

type Bubble = {
  role: "user" | "desk";
  text: string;
  activity: string[];
  live: string;
  draft?: DeskDraft;
  source?: "spacexai" | "filings";
  approval?: string;
};

function loadAccount(): DeskAccount | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskAccount;
    if (!parsed?.name || !parsed.business || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function DeskChat({
  open,
  onClose,
  selectedId,
  sessionId,
  onResults,
  onOpenStorefront,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  sessionId: string;
  onResults: (results: Summary[]) => void;
  onOpenStorefront: (id: string) => void;
}) {
  const [account, setAccount] = useState<DeskAccount | null>(null);
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadAccount();
    setAccount(saved);
    if (saved) {
      setName(saved.name);
      setBusiness(saved.business);
      setEmail(saved.email);
    }
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, open]);

  function saveAccount(event: FormEvent) {
    event.preventDefault();
    const next = { name: name.trim(), business: business.trim(), email: email.trim() };
    if (next.name.length < 2 || next.business.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setFormError("Enter your name, business, and a real email.");
      return;
    }
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    setAccount(next);
    setFormError("");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draftText.trim();
    if (!text || !account || busy) return;
    const history = [
      ...messages.filter((message) => message.text).map((message) => ({
        role: message.role === "desk" ? "assistant" as const : "user" as const,
        text: message.text,
      })),
      { role: "user" as const, text },
    ];
    setDraftText("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", text, activity: [], live: "" }, { role: "desk", text: "", activity: [], live: "Starting" }]);
    const patchDesk = (patch: Partial<Bubble>) => {
      setMessages((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (!last || last.role !== "desk") return current;
        copy[copy.length - 1] = { ...last, ...patch };
        return copy;
      });
    };
    try {
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, account, selectedId, messages: history }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: "The desk failed." }));
        patchDesk({ live: "", text: payload.error || "The desk failed." });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let activity: string[] = [];
      let live = "Starting";
      let reply = "";
      let source: Bubble["source"];
      let draft: DeskDraft | undefined;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DeskEvent;
          if (event.type === "status") live = event.text;
          if (event.type === "activity") {
            activity = [...activity, event.text];
            live = "";
          }
          if (event.type === "results") onResults(event.results);
          if (event.type === "draft") {
            draft = event.draft;
            onOpenStorefront(event.draft.propertyId);
          }
          if (event.type === "reply") {
            reply = event.text;
            source = event.source;
            live = "";
          }
          patchDesk({ activity, live, text: reply, draft, source });
        }
      }
    } catch (caught) {
      patchDesk({ live: "", text: caught instanceof Error ? caught.message : "The desk failed." });
    } finally {
      setBusy(false);
    }
  }

  async function approve(bubbleIndex: number, draft: DeskDraft) {
    if (!account) return;
    const response = await fetch("/api/desk/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, account, draft }),
    });
    const payload = await response.json();
    setMessages((current) => current.map((message, index) => (
      index === bubbleIndex ? { ...message, approval: payload.text || payload.error || "Could not save." } : message
    )));
  }

  if (!open) return null;

  return (
    <section className="desk" aria-label="Lease desk">
      <header className="desk-head">
        <div>
          <strong>Lease desk</strong>
          <p>{account ? account.business : "Who is asking"}</p>
        </div>
        <button type="button" className="desk-close" onClick={onClose} aria-label="Close desk">
          Close
        </button>
      </header>
      {!account ? (
        <form className="desk-account" onSubmit={saveAccount}>
          <p>The desk writes notes in your name, so it needs an account before the first message. Google sign-in is not connected. This name and email stay in this browser.</p>
          <label>
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
          </label>
          <label>
            Business
            <input value={business} onChange={(event) => setBusiness(event.target.value)} />
          </label>
          <label>
            Reply-to email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          {formError && <p className="error">{formError}</p>}
          <button type="submit" className="onboard-primary">Continue</button>
        </form>
      ) : (
        <>
          <div className="desk-log" ref={scroller}>
            {messages.length === 0 && (
              <p className="desk-empty">Ask for a kind of space, or ask for a note on the storefront you have open.</p>
            )}
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={message.role === "user" ? "desk-user" : "desk-bot"}>
                {message.activity.map((line) => (
                  <p key={line} className="desk-step done">{line}</p>
                ))}
                {message.live && <p className="desk-step">{message.live}…</p>}
                {message.text && <p className="desk-text">{message.text}</p>}
                {message.source && <p className="desk-source">{message.source === "spacexai" ? "SpaceXAI" : "Filing search"}</p>}
                {message.draft && (
                  <div className="desk-draft">
                    <p><b>{message.draft.subject}</b></p>
                    <p className="sub">{message.draft.toLabel}{message.draft.to ? ` · ${message.draft.to}` : ""}</p>
                    <pre>{message.draft.body}</pre>
                    {message.draft.to && !message.approval && (
                      <button type="button" onClick={() => approve(index, message.draft!)}>Approve note</button>
                    )}
                    {message.approval && <p className="desk-source">{message.approval}</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
          <form className="desk-compose" onSubmit={send}>
            <input
              aria-label="Message the desk"
              placeholder="Ask the desk"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
            />
            <button type="submit" disabled={busy || !draftText.trim()}>Send</button>
          </form>
        </>
      )}
    </section>
  );
}
