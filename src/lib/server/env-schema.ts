import { z } from "zod";

// Pure schema, no `server-only` marker, so tests and scripts can import it.
// App code should import `env` from ./env instead.

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecret = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());

const flag = z
  .preprocess(blankToUndefined, z.enum(["true", "false"]).default("false"))
  .transform((value) => value === "true");

export const serverEnvSchema = z.object({
  // Owner keys. Used for smoke tests, eval runs and the limited trial path only.
  // Visitors bring their own keys (BYOK); those never touch process.env.
  NEBIUS_API_KEY: optionalSecret,
  NEBIUS_BASE_URL: z.preprocess(
    blankToUndefined,
    z.url({ protocol: /^https$/ }).default("https://api.tokenfactory.nebius.com/v1/"),
  ),
  TAVILY_API_KEY: optionalSecret,

  // Spend controls for runs paid with owner keys.
  LIVE_RUNS_ENABLED: flag,
  TRIAL_RUNS_ENABLED: flag,
  DAILY_BUDGET_USD: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(100).default(0)),

  // Where runs are saved, so each one gets a public link. Both unset means runs
  // aren't saved. The secret key bypasses row level security: server only.
  SUPABASE_URL: z.preprocess(blankToUndefined, z.url({ protocol: /^https$/ }).optional()),
  SUPABASE_SECRET_KEY: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  constructor(public readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvError";
  }
}

// Error messages name the variable, never its value.
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvError(names);
  }
  return result.data;
}

export type OwnerKey = "NEBIUS_API_KEY" | "TAVILY_API_KEY";

// Returns the requested owner keys or names every missing one.
export function requireOwnerKeys<K extends OwnerKey>(env: ServerEnv, names: readonly K[]): Record<K, string> {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) throw new EnvError(missing);
  return Object.fromEntries(names.map((name) => [name, env[name]])) as Record<K, string>;
}
