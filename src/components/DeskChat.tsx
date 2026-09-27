"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DeskAccount, DeskDraft, DeskEvent } from "@/lib/desk";
import type { Summary } from "@/lib/types";

const ACCOUNT_KEY = "leaselens-desk-account";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

type Bubble = {
  role: "user" | "desk";
  text: string;
  activity: string[];
  live: string;
  draft?: DeskDraft;
  source?: "spacexai" | "filings";
  approval?: string;
};

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

function loadAccount(): DeskAccount | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskAccount;
    if (!parsed?.name || !parsed.business || !parsed.email) return null;
    if (parsed.provider !== "google" && parsed.provider !== "manual") delete parsed.provider;
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
  const [fromGoogle, setFromGoogle] = useState(false);
  const [googleName, setGoogleName] = useState("");
  const [googleCredential, setGoogleCredential] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const googleHost = useRef<HTMLDivElement>(null);
  const acceptGoogle = useRef<(credential: string) => void>(() => {});

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

  acceptGoogle.current = (credential: string) => {
    void (async () => {
      setFormError("");
      setSaving(true);
      try {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setFormError(payload.error || "Google sign-in failed.");
          return;
        }
        if (payload.account?.name && payload.account.business && payload.account.email) {
          const next = { ...payload.account, provider: "google" as const };
          window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
          setAccount(next);
          setFormError("");
          return;
        }
        setName(payload.name || "");
        setEmail(payload.email || "");
        setGoogleName(payload.name || "");
        setGoogleCredential(credential);
        setFromGoogle(true);
      } catch {
        setFormError("Google sign-in failed.");
      } finally {
        setSaving(false);
      }
    })();
  };

  useEffect(() => {
    if (!open || account || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    const render = () => {
      const host = googleHost.current;
      if (cancelled || !host || !window.google?.accounts?.id) return;
      host.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) acceptGoogle.current(response.credential);
        },
      });
      const width = Math.max(240, Math.min(352, host.clientWidth || 352));
      window.google.accounts.id.renderButton(host, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signup_with",
        shape: "pill",
        width,
        logo_alignment: "left",
      });
    };
    if (window.google?.accounts?.id) {
      render();
      return () => {
        cancelled = true;
      };
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-leaselens-gsi="1"]');
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", render);
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.leaselensGsi = "1";
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [open, account]);

  function clearGoogle() {
    setFromGoogle(false);
    setGoogleCredential("");
    setGoogleName("");
    setName("");
    setEmail("");
    setFormError("");
  }

  function signOut() {
    window.localStorage.removeItem(ACCOUNT_KEY);
    setAccount(null);
    setMessages([]);
    setNotice("");
    clearGoogle();
    setBusiness("");
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    const next = { name: name.trim(), business: business.trim(), email: email.trim() };
    if (!fromGoogle && (next.name.length < 2 || next.business.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))) {
      setFormError("Enter your name, business, and a real email.");
      return;
    }
    if (next.business.length < 2) {
      setFormError("Enter the business name.");
      return;
    }
    if (fromGoogle) {
      if (!googleCredential) {
        setFormError("Google sign-in expired. Continue with Google again.");
        return;
      }
      setSaving(true);
      try {
        const response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: googleCredential, business: next.business, name: next.name }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.account) {
          setFormError(payload.error || "Could not create the Google account.");
          return;
        }
        const saved = { ...payload.account, provider: "google" as const };
        window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(saved));
        setAccount(saved);
        setNotice(payload.stored ? "" : "Account saved in this browser. The database did not store it.");
        setFormError("");
      } catch {
        setFormError("Could not create the Google account.");
      } finally {
        setSaving(false);
      }
      return;
    }
    const manual = { ...next, provider: "manual" as const };
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(manual));
    setAccount(manual);
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
          <p>{account ? (account.provider === "google" ? `${account.business} · Google` : account.business) : "Who is asking"}</p>
        </div>
        <div className="desk-head-actions">
          {account && (
            <button type="button" className="desk-close" onClick={signOut}>
              Sign out
            </button>
          )}
          <button type="button" className="desk-close" onClick={onClose} aria-label="Close desk">
            Close
          </button>
        </div>
      </header>
      {!account ? (
        <form className="desk-account" onSubmit={saveAccount}>
          <p>
            {fromGoogle
              ? `Google confirmed ${email}. Add the business name to create the account.`
              : "The desk writes notes in your name. Continue with Google, or type a name and email for this browser. The business name is required either way."}
          </p>
          {!fromGoogle && (GOOGLE_CLIENT_ID ? (
            <div ref={googleHost} className="desk-google" />
          ) : (
            <button
              type="button"
              className="desk-google-fallback"
              onClick={() => setFormError("Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to .env.local, then restart the app.")}
            >
              Continue with Google
            </button>
          ))}
          {fromGoogle && (
            <button type="button" className="desk-text-button" onClick={clearGoogle}>
              Use a different account
            </button>
          )}
          {!fromGoogle && <p className="desk-or">or enter it yourself</p>}
          <label>
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" readOnly={fromGoogle && googleName.length >= 2} />
          </label>
          <label>
            Business
            <input value={business} onChange={(event) => setBusiness(event.target.value)} />
          </label>
          <label>
            Reply-to email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" readOnly={fromGoogle} />
          </label>
          {formError && <p className="error">{formError}</p>}
          <button type="submit" className="onboard-primary" disabled={saving}>
            {fromGoogle ? "Create account" : "Continue"}
          </button>
        </form>
      ) : (
        <>
          <div className="desk-log" ref={scroller}>
            {notice && <p className="desk-empty">{notice}</p>}
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
