// Turns provider SDK errors into a shape that is safe to log and to send to the
// browser. SDK error objects can carry request config and headers, so the raw
// error is never logged or serialized; only the fields below leave this module.

export type Provider = "nebius" | "tavily";

export type ErrorKind =
  | "auth"
  | "rate_limit"
  | "quota"
  | "bad_request"
  | "not_found"
  | "timeout"
  | "upstream"
  | "network"
  | "unknown";

export type SafeProviderError = {
  provider: Provider;
  kind: ErrorKind;
  status: number | null;
  message: string;
  // Redacted, truncated provider message. Only for request-shape errors, where
  // it is useful for debugging and unlikely to echo credentials.
  detail?: string;
};

const MESSAGES: Record<ErrorKind, string> = {
  auth: "The API key was rejected.",
  rate_limit: "Too many requests; slow down.",
  quota: "Out of credits or over the plan limit.",
  bad_request: "The provider rejected the request.",
  not_found: "The requested model or resource was not found.",
  timeout: "The provider did not respond in time.",
  upstream: "The provider had an internal error.",
  network: "Could not reach the provider.",
  unknown: "Unexpected provider error.",
};

const DETAIL_KINDS: ReadonlySet<ErrorKind> = new Set(["bad_request", "not_found"]);
const MAX_DETAIL_LENGTH = 300;

const TOKEN_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|tvly|lsv2|pk|rk)[-_][A-Za-z0-9._-]{8,}/gi,
  /\b[A-Za-z0-9_-]{32,}\b/g,
];

// Providers sometimes echo a masked key ("tvly-dev-****abcd"), so besides the
// full value we also remove its first and last few characters.
function secretFragments(secret: string): string[] {
  if (secret.length < 16) return [secret];
  return [secret, secret.slice(0, 8), secret.slice(-6)];
}

export function redactSecrets(text: string, secrets: readonly (string | undefined)[] = []): string {
  let output = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    for (const fragment of secretFragments(secret)) output = output.split(fragment).join("[redacted]");
  }
  for (const pattern of TOKEN_PATTERNS) output = output.replace(pattern, "[redacted]");
  return output;
}

function readStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") return status;
  // The Tavily SDK rethrows HTTP errors as plain Errors: "401 Error: {...}".
  const message = (err as { message?: unknown }).message;
  const match = typeof message === "string" ? /^(\d{3}) Error/.exec(message) : null;
  return match ? Number(match[1]) : null;
}

function classify(status: number | null, name: string, message: string): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  // 402: out of credit. 432/433: Tavily plan and pay-as-you-go limits.
  if (status === 402 || status === 432 || status === 433) return "quota";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status !== null && status >= 500) return "upstream";
  if (status !== null && status >= 400) return "bad_request";
  if (/timeout|timed out/i.test(name + message)) return "timeout";
  if (/unauthori[sz]ed|invalid api key|api key/i.test(message)) return "auth";
  if (/usage limit|plan limit|credits?|quota/i.test(message)) return "quota";
  if (/rate limit|too many requests/i.test(message)) return "rate_limit";
  if (/connection|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(name + message)) return "network";
  return "unknown";
}

export function toSafeError(
  provider: Provider,
  err: unknown,
  secrets: readonly (string | undefined)[] = [],
): SafeProviderError {
  const status = readStatus(err);
  const name = err instanceof Error ? err.name : "";
  const rawMessage = err instanceof Error ? err.message : "";
  const kind = classify(status, name, rawMessage);
  const base: SafeProviderError = { provider, kind, status, message: MESSAGES[kind] };
  if (!DETAIL_KINDS.has(kind) || !rawMessage) return base;
  return { ...base, detail: redactSecrets(rawMessage, secrets).slice(0, MAX_DETAIL_LENGTH) };
}
