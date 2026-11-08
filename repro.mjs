import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

// Fake clock: one request every 5 simulated seconds, so at most 2 per 10 s window.
let now = Date.UTC(2026, 0, 1);
Date.now = () => now;

const INTERVAL_MS = 5_000;
const REQUESTS = 303;

async function run(storage, ip) {
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "a-test-secret-that-is-long-enough-for-better-auth",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    // Default limit otherwise: max 100 per 10 s window.
    rateLimit: { enabled: true, storage },
  });

  const start = now;
  let ok = 0;
  for (let i = 1; i <= REQUESTS; i++) {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    if (res.status === 200) ok++;
    else if (res.status === 429) {
      console.log(
        `[${storage}] request ${i} at t=${(now - start) / 1000}s -> 429 ` +
          `(X-Retry-After: ${res.headers.get("X-Retry-After")})`,
      );
    } else throw new Error(`unexpected ${res.status} on request ${i}`);
    now += INTERVAL_MS;
  }
  console.log(`[${storage}] ${REQUESTS - ok} of ${REQUESTS} requests got 429, at 2 requests per 10 s\n`);
}

await run("memory", "203.0.113.7");
await run("database", "203.0.113.8");
