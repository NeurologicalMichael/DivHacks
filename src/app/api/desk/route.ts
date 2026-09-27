import { cleanAccount, runDesk } from "@/lib/desk";
import type { DeskEvent } from "@/lib/desk";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    account?: unknown;
    selectedId?: string | null;
    messages?: { role?: string; text?: string }[];
  };
  const account = cleanAccount(body.account);
  if (!account) return Response.json({ error: "Name, business, and email are required." }, { status: 400 });
  const messages = (body.messages || [])
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.text === "string")
    .slice(-8)
    .map((message) => ({ role: message.role as "user" | "assistant", text: message.text!.trim().slice(0, 2000) }))
    .filter((message) => message.text);
  if (!messages.some((message) => message.role === "user")) {
    return Response.json({ error: "A message is required." }, { status: 400 });
  }
  const selectedId = typeof body.selectedId === "string" ? body.selectedId.slice(0, 200) : null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DeskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runDesk(messages, account, selectedId, send);
      } catch (error) {
        send({ type: "reply", text: error instanceof Error ? error.message : "The desk failed.", source: "filings" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
