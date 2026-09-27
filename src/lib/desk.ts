import { query } from "./db";
import { titleAddress } from "./format";
import { describeFilters, parseQuery } from "./parseQuery";
import { getStorefront, searchStorefronts } from "./queries";
import type { SearchFilters, StorefrontDetail, Summary } from "./types";

export type DeskAccount = {
  name: string;
  business: string;
  email: string;
  provider?: "google" | "manual";
};

export type DeskDraft = {
  id: string;
  propertyId: string;
  address: string;
  to: string | null;
  toLabel: string;
  subject: string;
  body: string;
};

export type DeskEvent =
  | { type: "status"; text: string }
  | { type: "activity"; text: string }
  | { type: "results"; results: Summary[] }
  | { type: "draft"; draft: DeskDraft }
  | { type: "reply"; text: string; source: "spacexai" | "filings" };

type Emit = (event: DeskEvent) => void;

const MODEL = process.env.XAI_MODEL || "grok-4.7";

export function cleanAccount(input: unknown): DeskAccount | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const business = typeof raw.business === "string" ? raw.business.trim().slice(0, 80) : "";
  const email = typeof raw.email === "string" ? raw.email.trim().slice(0, 120) : "";
  if (name.length < 2 || business.length < 2) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const provider = raw.provider === "google" || raw.provider === "manual" ? raw.provider : undefined;
  return provider ? { name, business, email, provider } : { name, business, email };
}

function brief(result: Summary) {
  return {
    id: result.id,
    address: result.address,
    neighborhood: result.neighborhood,
    borough: result.borough,
    turnoverScore: result.turnoverScore,
    fitScore: result.fitScore,
    vacant: result.vacant,
    leaseExpiration: result.leaseExpiration,
    availability: result.availability.label,
    landlordOptIn: result.hasLandlordOptIn && !result.hasDemoLandlord,
    signals: result.topSignals.map((signal) => signal.label),
  };
}

function detailBrief(detail: StorefrontDetail) {
  return {
    ...brief(detail),
    zoning: detail.zoning,
    signals: detail.signals.slice(0, 6).map((signal) => ({
      label: signal.label,
      evidence: signal.evidence,
      source: signal.source,
    })),
    timeline: detail.timeline.slice(0, 6).map((event) => ({
      at: event.occurredAt,
      title: event.title,
      source: event.source,
    })),
  };
}

async function landlordEmail(propertyId: string): Promise<string | null> {
  try {
    const rows = await query<{ contact_email: string | null }>(
      `SELECT contact_email FROM landlord_signals
       WHERE property_id = $1 AND active AND NOT is_demo AND contact_email IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [propertyId],
    );
    const email = rows[0]?.contact_email?.trim();
    return email || null;
  } catch {
    return null;
  }
}

function brokerFrom(text: string) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

async function makeDraft(account: DeskAccount, propertyId: string, brokerEmail: string | null): Promise<DeskDraft | null> {
  const detail = await getStorefront(propertyId, null);
  if (!detail) return null;
  const optedIn = await landlordEmail(propertyId);
  const to = optedIn || brokerEmail;
  const toLabel = optedIn ? "Landlord who opted in" : brokerEmail ? "Broker address you typed" : "No contact on file";
  const address = titleAddress(detail.address);
  const lease = detail.leaseExpiration
    ? `The filing includes a lease date of ${detail.leaseExpiration}.`
    : "The filing does not include a lease date.";
  return {
    id: crypto.randomUUID(),
    propertyId,
    address,
    to,
    toLabel,
    subject: `Inquiry about ${address}`,
    body: [
      "Hello,",
      "",
      `I am ${account.name} at ${account.business}. I am looking at ${address} in ${detail.neighborhood}.`,
      "",
      `What the city filing shows: ${detail.availability.label}. ${lease} Turnover score ${detail.turnoverScore} comes from the public records on this filing.`,
      "",
      "If the space may become available, I would like to hear from you.",
      "",
      account.name,
      account.email,
    ].join("\n"),
  };
}

const TOOLS = [
  {
    type: "function",
    name: "search_storefronts",
    description: "Search NYC storefront filings already loaded in LeaseLens. Returns addresses and scores. Does not invent rents or lease dates.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The user's search in plain language." } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_storefront",
    description: "Read one storefront filing, its scores, and its timeline.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Storefront id from search_storefronts." } },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "draft_inquiry",
    description: "Draft a note the user must approve before anything is saved. Use a landlord opt-in email or a broker email the user typed. Never invent an address.",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string" },
        brokerEmail: { type: "string", description: "Optional broker email the user typed." },
      },
      required: ["propertyId"],
    },
  },
];

async function runTool(
  name: string,
  args: Record<string, unknown>,
  account: DeskAccount,
  emit: Emit,
  bag: { results: Summary[]; draft: DeskDraft | null; filters: SearchFilters | null },
) {
  if (name === "search_storefronts") {
    const queryText = typeof args.query === "string" ? args.query : "";
    emit({ type: "status", text: "Searching filings" });
    const filters = parseQuery(queryText);
    const results = await searchStorefronts(filters);
    bag.results = results;
    bag.filters = filters;
    emit({ type: "results", results });
    emit({ type: "activity", text: `Searched filings · ${describeFilters(filters, results.length)}` });
    return { count: results.length, results: results.slice(0, 8).map(brief) };
  }
  if (name === "get_storefront") {
    const id = typeof args.id === "string" ? args.id : "";
    emit({ type: "status", text: "Reading a filing" });
    const detail = id ? await getStorefront(id, null) : null;
    emit({
      type: "activity",
      text: detail ? `Read ${titleAddress(detail.address)}` : "No filing matched that id",
    });
    return detail ? detailBrief(detail) : { error: "Storefront not found" };
  }
  if (name === "draft_inquiry") {
    const propertyId = typeof args.propertyId === "string" ? args.propertyId : "";
    const brokerEmail = typeof args.brokerEmail === "string" ? args.brokerEmail.trim() : null;
    emit({ type: "status", text: "Drafting a note" });
    const draft = propertyId ? await makeDraft(account, propertyId, brokerEmail) : null;
    if (!draft) {
      emit({ type: "activity", text: "Could not draft a note" });
      return { error: "Storefront not found" };
    }
    bag.draft = draft;
    emit({ type: "draft", draft });
    emit({
      type: "activity",
      text: draft.to ? `Drafted a note to ${draft.toLabel}` : "Drafted a note with no contact on file",
    });
    return {
      draftId: draft.id,
      address: draft.address,
      toLabel: draft.toLabel,
      canSend: Boolean(draft.to),
      subject: draft.subject,
    };
  }
  return { error: "Unknown tool" };
}

function localReply(results: Summary[], filters: SearchFilters | null, draft: DeskDraft | null) {
  const parts: string[] = [];
  if (filters) parts.push(describeFilters(filters, results.length));
  else if (!results.length) parts.push("No filings matched that request.");
  const top = results.slice(0, 3).map((result) => `${titleAddress(result.address)} in ${result.neighborhood}`);
  if (top.length) parts.push(`Highest on the list: ${top.join("; ")}.`);
  if (draft?.to) parts.push("A note is ready below. It is not sent until you approve it.");
  else if (draft) parts.push("The note has no recipient. A landlord has to opt in, or you can type a broker email.");
  return parts.join(" ");
}

async function filingDesk(text: string, account: DeskAccount, selectedId: string | null, emit: Emit) {
  const bag = { results: [] as Summary[], draft: null as DeskDraft | null, filters: null as SearchFilters | null };
  const outreach = /\b(reach out|email|e-mail|contact|landlord|realtor|broker|draft|write|send)\b/i.test(text);
  if (outreach && selectedId) {
    await runTool("get_storefront", { id: selectedId }, account, emit, bag);
    await runTool("draft_inquiry", { propertyId: selectedId, brokerEmail: brokerFrom(text) }, account, emit, bag);
  } else {
    await runTool("search_storefronts", { query: text }, account, emit, bag);
    const chosen = selectedId && bag.results.some((result) => result.id === selectedId) ? selectedId : null;
    if (outreach && (chosen || bag.results[0])) {
      const propertyId = chosen || bag.results[0].id;
      await runTool("get_storefront", { id: propertyId }, account, emit, bag);
      await runTool("draft_inquiry", { propertyId, brokerEmail: brokerFrom(text) }, account, emit, bag);
    }
  }
  emit({ type: "reply", text: localReply(bag.results, bag.filters, bag.draft), source: "filings" });
}

type ModelCall = { name: string; arguments: string; callId: string };

function callsOf(output: unknown[]): ModelCall[] {
  return output.flatMap((item) => {
    const row = item as { type?: string; name?: string; arguments?: string; call_id?: string };
    if (row.type === "function_call" && row.name && row.call_id) {
      return [{ name: row.name, arguments: row.arguments || "{}", callId: row.call_id }];
    }
    return [];
  });
}

function textOf(output: unknown[]) {
  const parts: string[] = [];
  for (const item of output) {
    const row = item as { type?: string; content?: { text?: string }[] };
    if (row.type !== "message" || !Array.isArray(row.content)) continue;
    for (const block of row.content) {
      if (block.text) parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

async function spacexDesk(
  history: { role: "user" | "assistant"; text: string }[],
  account: DeskAccount,
  selectedId: string | null,
  emit: Emit,
) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    emit({ type: "activity", text: "SpaceXAI key is not set. Using the filings." });
    await filingDesk(history.at(-1)?.text || "", account, selectedId, emit);
    return;
  }
  emit({ type: "status", text: "Asking SpaceXAI" });
  const bag = { results: [] as Summary[], draft: null as DeskDraft | null, filters: null as SearchFilters | null };
  let previous: string | undefined;
  let input: unknown[] = [
    {
      role: "system",
      content: `You are the LeaseLens desk for ${account.name} at ${account.business} (${account.email}). Use tools for every fact about a storefront. Never invent a lease date, rent, owner, or email. The open storefront id is ${selectedId || "none"}. A draft is not sent until the user approves it in the app.`,
    },
    ...history.slice(-8).map((message) => ({ role: message.role, content: message.text })),
  ];
  for (let step = 0; step < 4; step += 1) {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input,
        tools: TOOLS,
        previous_response_id: previous,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const payload = (await response.json()) as { id?: string; output?: unknown[]; error?: { message?: string } };
    if (!response.ok) {
      const reason = payload.error?.message || `SpaceXAI returned ${response.status}`;
      emit({ type: "activity", text: `SpaceXAI did not answer (${reason}). Using the filings.` });
      await filingDesk(history.at(-1)?.text || "", account, selectedId, emit);
      return;
    }
    previous = payload.id;
    const output = payload.output || [];
    const calls = callsOf(output);
    const reply = textOf(output);
    if (!calls.length) {
      emit({ type: "activity", text: "SpaceXAI answered" });
      emit({ type: "reply", text: reply || localReply(bag.results, bag.filters, bag.draft), source: "spacexai" });
      return;
    }
    const outputs = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      const result = await runTool(call.name, args, account, emit, bag);
      outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(result) });
    }
    input = outputs;
  }
  emit({ type: "reply", text: localReply(bag.results, bag.filters, bag.draft), source: "spacexai" });
}

export async function runDesk(
  history: { role: "user" | "assistant"; text: string }[],
  account: DeskAccount,
  selectedId: string | null,
  emit: Emit,
) {
  try {
    await spacexDesk(history, account, selectedId, emit);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "request failed";
    emit({ type: "activity", text: `SpaceXAI did not answer (${reason}). Using the filings.` });
    await filingDesk(history.at(-1)?.text || "", account, selectedId, emit);
  }
}

export async function approveDraft(input: {
  sessionId: string;
  account: DeskAccount;
  draft: DeskDraft;
}) {
  if (!input.draft.to) return { ok: false, text: "This note has no recipient." };
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS outreach_messages (
         id TEXT PRIMARY KEY,
         session_id TEXT NOT NULL,
         property_id TEXT NOT NULL,
         sender_name TEXT NOT NULL,
         sender_business TEXT NOT NULL,
         sender_email TEXT NOT NULL,
         to_email TEXT,
         subject TEXT NOT NULL,
         body TEXT NOT NULL,
         status TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await query(
      `INSERT INTO outreach_messages (
         id, session_id, property_id, sender_name, sender_business, sender_email, to_email, subject, body, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved')
       ON CONFLICT (id) DO NOTHING`,
      [
        input.draft.id,
        input.sessionId,
        input.draft.propertyId,
        input.account.name,
        input.account.business,
        input.account.email,
        input.draft.to,
        input.draft.subject,
        input.draft.body,
      ],
    );
  } catch {
    return { ok: true, text: "Approved on this browser. The database did not store it, and it was not emailed." };
  }
  return { ok: true, text: "Approved and saved. No mail service is connected, so it was not emailed." };
}
