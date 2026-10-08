import { z } from "zod";

// The request body of POST /api/investigate. The quote and the name go straight
// into model prompts, so the caps here are a limit on what a visitor can send,
// not just tidiness. Keys travel in the body, never in the URL.

export const MAX_BODY_BYTES = 8_000;

// Pasted text often carries line breaks and tabs; any run of whitespace or
// control characters becomes one space.
const text = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

// A key is one printable token. Blank is allowed here so resolveRunKeys can
// report an incomplete BYOK request; anything with spaces or control characters
// inside cannot be a header value and is rejected.
const apiKey = z
  .string()
  .trim()
  .max(512)
  .regex(/^[\x21-\x7e]*$/)
  .optional();

export const investigateRequestSchema = z.strictObject({
  quote: text(500),
  popularAttribution: text(200),
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)
    .default("en"),
  keys: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("byok"), nebiusApiKey: apiKey, tavilyApiKey: apiKey }),
    z.strictObject({ mode: z.literal("trial") }),
  ]),
});

export type InvestigateRequest = z.infer<typeof investigateRequestSchema>;

export type ParsedRequest =
  | { ok: true; request: InvestigateRequest }
  | { ok: false; status: 400 | 413 | 415; error: string; fields?: string[] };

// Reads and validates the body. Error results name the fields that failed,
// never the values sent.
export async function parseInvestigateRequest(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) return { ok: false, status: 415, error: "expected_json" };
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413, error: "body_too_large" };

  let json: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return { ok: false, status: 413, error: "body_too_large" };
    json = JSON.parse(raw);
  } catch {
    // Bad JSON, or a body the client stopped sending.
    return { ok: false, status: 400, error: "invalid_json" };
  }
  const parsed = investigateRequestSchema.safeParse(json);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body"))];
    return { ok: false, status: 400, error: "invalid_request", fields };
  }
  return { ok: true, request: parsed.data };
}
