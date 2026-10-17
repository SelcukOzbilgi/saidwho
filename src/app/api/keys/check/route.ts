import { env } from "@/lib/server/env";
import { createKeysCheckHandler } from "@/lib/server/keys-check-handler";
import { limiterFromEnv } from "@/lib/server/rate-limit";

// Runs on Node, the default for a route (the keys stay on this server, as for a
// run). A POST handler is never cached, and every reply says no-store as well.
export const POST = createKeysCheckHandler({ env, limiter: limiterFromEnv(env) });
