// Shared guards for provider factories. Both SDKs read extra settings from
// process.env (org/project ids, proxies, custom headers). Those would apply to
// every request, including ones made with a visitor's own key. Settings we can
// pin in code (apiKey, baseURL, organization, project, logLevel) are pinned in
// the factories; the ones below cannot be overridden, so we refuse to start a
// client while any of them is set.

const SDK_ENV_OVERRIDES = [
  "OPENAI_CUSTOM_HEADERS",
  "TAVILY_PROJECT",
  "TAVILY_ORG_ID",
  "TAVILY_HTTP_PROXY",
  "TAVILY_HTTPS_PROXY",
] as const;

export function assertNoSdkEnvOverrides(env: Record<string, string | undefined> = process.env): void {
  const present = SDK_ENV_OVERRIDES.filter((name) => env[name]);
  if (present.length > 0) {
    throw new Error(`Unset these environment variables; they would apply to every provider call: ${present.join(", ")}`);
  }
}

// Trims a pasted key and rejects anything that cannot be a header value.
export function normalizeApiKey(raw: string, label: string): string {
  const key = raw.trim();
  if (!key) throw new Error(`${label} API key is required`);
  if (/[\s\u0000-\u001f\u007f]/.test(key)) throw new Error(`${label} API key contains invalid characters`);
  return key;
}

export const NEBIUS_ALLOWED_HOSTS: ReadonlySet<string> = new Set(["api.tokenfactory.nebius.com"]);

// Keys are only ever sent to known provider hosts over https.
export function assertAllowedBaseUrl(baseURL: string): void {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error("Nebius base URL is not a valid URL");
  }
  if (url.protocol !== "https:" || !NEBIUS_ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("Nebius base URL must be https://api.tokenfactory.nebius.com");
  }
}
