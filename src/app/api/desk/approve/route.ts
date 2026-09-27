import { approveDraft, cleanAccount, type DeskDraft } from "@/lib/desk";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string; account?: unknown; draft?: DeskDraft };
  const account = cleanAccount(body.account);
  const draft = body.draft;
  if (!account || !draft?.id || !draft.propertyId || !draft.subject || !draft.body) {
    return Response.json({ error: "Account and draft are required." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : "";
  const result = await approveDraft({ sessionId, account, draft });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
