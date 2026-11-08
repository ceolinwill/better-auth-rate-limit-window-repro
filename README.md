# better-auth rate limiter rejects steady traffic below the limit

With the default rate limit (`max: 100` per `window: 10` seconds), a client sending one request every 5 seconds (2 per window, far under the limit) gets a 429 on its 101st request, about 8 minutes in, and again every 101 requests after that. Both the `memory` and `database` storages do it. The count only resets once `window` seconds pass since the last *accepted* request, and every accepted request moves that timestamp forward, so `max` behaves like "requests in a row without a `window`-long pause" rather than "requests per `window`".

Reported in better-auth/better-auth#11660 (this repo adds the database storage, the default limit and the latest stable and beta versions).

## Reproduction

```sh
npm install
npm run repro
```

`repro.mjs` creates `betterAuth` with `rateLimit: { enabled: true, storage }` and nothing else, overrides `Date.now` to fake the clock, and calls `GET /api/auth/get-session` through `auth.handler` from one IP (`x-forwarded-for`) every 5 simulated seconds, 303 times, once per storage.

Output with `better-auth@1.7.18` (identical with `1.8.0-beta.6`):

```
[memory] request 101 at t=500s -> 429 (X-Retry-After: 5)
[memory] request 202 at t=1005s -> 429 (X-Retry-After: 5)
[memory] request 303 at t=1510s -> 429 (X-Retry-After: 5)
[memory] 3 of 303 requests got 429, at 2 requests per 10 s

[database] request 101 at t=500s -> 429 (X-Retry-After: 5)
[database] request 202 at t=1005s -> 429 (X-Retry-After: 5)
[database] request 303 at t=1510s -> 429 (X-Retry-After: 5)
[database] 3 of 303 requests got 429, at 2 requests per 10 s
```

## Expected

A client that never sends more than `max` requests in any `window` seconds is never rate limited. The [rate limit docs](https://github.com/better-auth/better-auth/blob/v1.7.18/docs/content/docs/concepts/rate-limit.mdx) describe the limit as `max` requests within `window` seconds, and the code comment on `decideConsume` calls it a "rolling `window`".

## Actual

The 101st request is refused although the client sent 2 requests in the previous 10 seconds. A rejected request does not move `lastRequest`, so the next request 10 s after the last accepted one resets the count, and the cycle repeats every 101 requests. A client polling every 3 s gets 3 refusals in a row each cycle.

In `src/api/rate-limiter/index.ts` (unchanged on `main` and `next`):

- memory storage, `decideConsume`: resets only when `now - data.lastRequest >= windowInMs`, and the allowed branch sets `lastRequest: now`.
- database storage, `createDatabaseStorageWrapper().consume`: same reset condition, and the guarded `incrementOne` for an allowed request sets `lastRequest: now`.

## Environment

- better-auth 1.7.18 (npm `latest`) and 1.8.0-beta.6 (npm `beta`)
- Node.js 24.22.0, npm 11.19.1
- macOS
