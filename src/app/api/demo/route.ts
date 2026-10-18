// POST /api/demo { name, email, agency?, message? } -> mails the team a demo request from the landing page.
// Public: limited per address, refused from other sites' pages by src/proxy.ts, a filled honeypot swallowed.

import { getDb } from "@/db/client";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { demoRequestsTo, readDemoRequest, sendDemoRequest } from "@/lib/demoRequests";
import { readBody } from "@/lib/reviewViewer";

export async function POST(request: Request) {
  const demo = readDemoRequest(await readBody(request));
  if (!demo.ok) return Response.json({ error: demo.error }, { status: 400 });
  // Bots fill the hidden field: told "ok", nothing sent, nothing counted.
  if (demo.value.trap) return Response.json({ ok: true });
  const to = demoRequestsTo();
  if (!to) return Response.json({ error: "Les demandes de démo ne sont pas configurées sur ce serveur." }, { status: 503 });

  const origin = requestOrigin(request);
  try {
    if (!(await withinLimit(getDb(), `demo:${origin.ipAddress ?? "inconnue"}`, requestLimit.demo()))) return tooManyRequests();
  } catch (error) {
    return databaseFailure("api/demo", error);
  }
  const sent = await sendDemoRequest(demo.value, to, origin);
  return sent ? Response.json({ ok: true }) : Response.json({ error: "L’envoi n’a pas abouti. Réessayez dans un instant." }, { status: 503 });
}
