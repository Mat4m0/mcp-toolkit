# Work Log

This document describes the full staged change set, including the follow-up fixes from review.

It answers, for each change:
- what the issue was
- why it existed
- what we wanted to solve
- what was affected
- how it was fixed

## Scope

The staged changes cover:
- transport security hardening
- resource path safety
- session hardening and lifecycle controls
- documentation corrections
- code mode string-safety cleanup
- API polish and developer ergonomics
- regression tests for the new behavior

## 1. Origin Validation

### Issue

Streamable HTTP requests did not enforce an origin policy. That left browser-exposed MCP endpoints open to cross-origin request abuse.

### Why the issue existed

There was no centralized transport-level origin validation in either provider. Requests reached transport handling directly.

### What we wanted to solve

We wanted a default-safe policy for browser-facing MCP endpoints:
- same-origin by default
- explicit opt-out via config
- explicit allowlist support when cross-origin is intentional

### What was affected

- Node transport
- Cloudflare transport
- module configuration
- security documentation and tests

### How we fixed it

We added `McpSecurityConfig` with `allowedOrigins` in:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/config.ts`
- `packages/nuxt-mcp-toolkit/src/module.ts`

We added `validateOrigin()` in:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/security.ts`

We now call it at the top of both providers:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/cloudflare.ts`

The important review fix was making the comparison use the full normalized origin, not just the host. The earlier host-only check would have accepted `http://example.com` against an HTTPS deployment on the same host, which is not same-origin.

Current behavior:
- no `Origin` header: allowed
- `allowedOrigins === '*'`: allowed
- explicit allowlist: allowed only when normalized origins match
- default mode: allowed only when `Origin` matches `getRequestURL(event).origin`
- rejected requests return `403`

### Verification

Added regression coverage in:
- `packages/nuxt-mcp-toolkit/test/sessions.test.ts`

Test added:
- rejects cross-scheme origins even on the same host

## 2. Path Traversal Protection for File Resources

### Issue

File-based MCP resources could resolve paths outside the project root.

### Why the issue existed

The implementation resolved `resource.file` with `resolve(process.cwd(), resource.file)` but did not verify that the resulting path stayed within the project root.

### What we wanted to solve

We wanted file resources to stay constrained to the project tree and fail fast if a definition attempted to escape it.

### What was affected

- file-based resource definitions
- projects exposing local files as MCP resources

### How we fixed it

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/definitions/resources.ts`

We now:
- compute `projectRoot`
- resolve `resource.file` against it
- reject the resource if the resolved path does not stay under `projectRoot + sep`

That blocks `../` traversal in resource definitions.

## 3. Session ID Validation

### Issue

Malformed session IDs were treated as missing sessions instead of invalid input.

### Why the issue existed

The transport accepted any string in `MCP-Session-Id` and only checked whether that string existed in the session map.

### What we wanted to solve

We wanted stricter request validation and clearer failure modes:
- malformed ID => bad request
- well-formed but unknown ID => missing session

### What was affected

- Node transport
- session composable safety
- test expectations

### How we fixed it

We added `isValidSessionId()` in:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/security.ts`

We now validate UUID v4 format in:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session.ts`

Behavior now:
- malformed ID => `400`
- unknown but well-formed ID => `404`

### Verification

Updated coverage in:
- `packages/nuxt-mcp-toolkit/test/sessions.test.ts`

## 4. Session Invalidation

### Issue

There were two real problems in the original invalidation approach:

1. It was coupled to the Node provider internals.
2. It could break the current middleware request by deleting the active session before transport handling ran.

### Why the issue existed

The first draft imported session deletion logic directly from the Node provider into the shared session composable. That made invalidation depend on the Node provider's in-memory map.

It also deleted the session immediately. But middleware runs before transport handling. So deleting the session in middleware could cause the current request to fall through into `Session not found`.

### What we wanted to solve

We wanted:
- a provider-neutral invalidation mechanism
- the current request to complete cleanly
- the next request to fail and force client re-initialization
- behavior that also works on Cloudflare, even though its transport lifecycle differs

### What was affected

- `invalidateMcpSession()`
- Node session lifecycle
- Cloudflare session behavior
- docs for auth/session changes
- session regression tests

### How we fixed it

We replaced direct provider coupling with shared invalidation state in:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session-state.ts`

This helper provides:
- request-time invalidation flagging on the event
- persistent invalidation metadata in `mcp:sessions-meta`

We changed:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session.ts`

`invalidateMcpSession()` now requests invalidation instead of deleting the session immediately.

#### Node behavior

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`

We now:
- check for invalidated sessions before using them
- mark a session invalidated if middleware requested it
- defer actual deletion until the current response closes
- reject the next request with `404 Session not found`

We also moved cleanup ordering so session map/storage cleanup happens before closing the transport, which avoids shutdown recursion.

#### Cloudflare behavior

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/cloudflare.ts`

We now:
- reject already-invalidated session IDs with `404`
- mark the session invalidated when middleware requests it

Because Cloudflare uses `agents/mcp`, we do not own the same live transport/session map there. So the provider-neutral fix is metadata-based: it blocks continued use of the session without trying to reach into non-shared provider internals.

#### Storage

In:
- `packages/nuxt-mcp-toolkit/src/module.ts`

We added:
- `mcp:sessions-meta`

This ensures the invalidation metadata has a storage backend whenever sessions are enabled.

### Result

Current semantics:
- `invalidateMcpSession()` during middleware does not break the current request
- the current request can still complete
- the session is marked for teardown/invalidation
- the next request using the same session ID is rejected

### Verification

Added fixture middleware in:
- `packages/nuxt-mcp-toolkit/test/fixtures/sessions/server/mcp/index.ts`

Added regression coverage in:
- `packages/nuxt-mcp-toolkit/test/sessions.test.ts`

Test added:
- invalidates the session after the current middleware request completes

## 5. Session Cap

### Issue

The server had no upper bound on concurrent sessions.

### Why the issue existed

Session creation was allowed whenever a request initialized a session. There was no admission control.

### What we wanted to solve

We wanted a simple guard against unbounded session growth and memory pressure.

### What was affected

- session creation on Node
- configuration surface
- docs

### How we fixed it

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/config.ts`
- `packages/nuxt-mcp-toolkit/src/module.ts`
- `apps/docs/content/1.getting-started/3.configuration.md`

We added:
- `sessions.maxSessions`
- default value `1000`

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`

We reject new session creation when the limit is reached with:
- status `503`
- `Retry-After: 60`

## 6. Session Continuity vs Resumability

### Issue

The documentation used “resumability” in places where the implementation only provided session continuity.

### Why the issue existed

The docs blurred two different concepts:
- continuing a session using the same `MCP-Session-Id`
- replaying missed SSE events after reconnect

Only the first exists in the current implementation.

### What we wanted to solve

We wanted the docs to describe the real behavior precisely and not over-claim event replay support.

### What was affected

- configuration docs
- sessions guide
- session API wording in the module options

### How we fixed it

We replaced “resumability” with “session continuity” and added a specific explanation in:
- `apps/docs/content/1.getting-started/3.configuration.md`
- `apps/docs/content/3.advanced/6.sessions.md`
- `packages/nuxt-mcp-toolkit/src/module.ts`

We also added an explicit note that true resumability would require event replay infrastructure such as an event store.

## 7. Authentication Docs: Soft vs Strict Auth

### Issue

The docs previously treated `401` as something that should broadly not be used.

### Why the issue existed

That was too absolute. It is true for mixed-access servers without OAuth endpoints, but it is not correct as a blanket rule for protected-only servers with OAuth discovery.

### What we wanted to solve

We wanted auth guidance that matches the protocol and common deployment modes.

### What was affected

- authentication example docs

### How we fixed it

In:
- `apps/docs/content/4.examples/1.authentication.md`

We replaced the blanket advice with two documented approaches:
- soft auth for mixed-access servers
- strict auth with `401` and `WWW-Authenticate: Bearer` for protected-only servers with OAuth endpoints

## 8. Code Mode RPC Token and String Interpolation Hardening

### Issue

Sandbox code generation used raw string interpolation for values inserted into generated JavaScript.

### Why the issue existed

The generated proxy boilerplate embedded tool names, tokens, ports, and error prefixes using quoted interpolation. That is fragile if embedded values contain characters that need JS string escaping.

### What we wanted to solve

We wanted generated code to be syntactically safe regardless of string contents.

### What was affected

- code mode sandbox boilerplate
- related test regex

### How we fixed it

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/codemode/executor.ts`

We replaced direct interpolation with `JSON.stringify(...)` for:
- tool names
- RPC token
- port string
- return tool name
- error prefix

In:
- `packages/nuxt-mcp-toolkit/test/codemode-executor.test.ts`

We updated the token extraction regex to match the new generated form.

## 9. `useMcpLogger()` Composable

### Issue

There was no first-class helper for sending MCP logging notifications from request handlers.

### Why the issue existed

The runtime exposed `useMcpServer()` for mutation but did not provide a dedicated logging composable even though the underlying server supports logging notifications.

### What we wanted to solve

We wanted a small, direct helper for MCP-spec logging notifications.

### What was affected

- server runtime ergonomics
- auto-imports

### How we fixed it

We added:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/logging.ts`

This exposes:
- `debug`
- `info`
- `notice`
- `warn`
- `error`
- `critical`
- `alert`
- `emergency`

It reads the active MCP server from request context and sends `notifications/message`.

We also auto-imported it in:
- `packages/nuxt-mcp-toolkit/src/module.ts`

## 10. Handler `route` Deprecation Clarification

### Issue

The `route` property on handler definitions implied support that the runtime does not actually implement.

### Why the issue existed

The JSDoc suggested the field was meaningful for custom handlers, but handlers are actually routed as `/mcp/:handlerName`.

### What we wanted to solve

We wanted the public type surface to stop implying unsupported behavior.

### What was affected

- handler type docs
- developer expectations

### How we fixed it

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/definitions/handlers.ts`

We marked `route` as deprecated and clarified:
- custom routes are not supported at runtime
- `mcp.route` changes the base route instead

## 11. Deeplink Escaping Documentation

### Issue

The deeplink handler already had escaping, but the security reasoning was implicit.

### Why the issue existed

Without an explicit comment, future changes could unintentionally weaken the escaping chain.

### What we wanted to solve

We wanted to document the trust boundary and the escaping path for maintainers.

### What was affected

- deeplink handler maintainability

### How we fixed it

In:
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/deeplink.ts`

We added a comment explaining:
- `serverName` passes through `encodeURIComponent`
- then through HTML/JS escaping
- `ideConfig.name` is hardcoded

## 12. Session Storage Hardening

### Issue

Session invalidation metadata needed a durable place to live alongside session data.

### Why the issue existed

The original session storage only tracked session-scoped data, not invalidation metadata.

### What we wanted to solve

We wanted invalidation to work consistently across request boundaries and across providers without introducing new transport-specific coupling.

### What was affected

- session lifecycle bookkeeping

### How we fixed it

We introduced:
- `mcp:sessions-meta:<sessionId>`

and clean it up when sessions are removed.

Files involved:
- `packages/nuxt-mcp-toolkit/src/module.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session-state.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/cloudflare.ts`

## 13. Test Additions and Changes

### What changed

In:
- `packages/nuxt-mcp-toolkit/test/sessions.test.ts`
- `packages/nuxt-mcp-toolkit/test/codemode-executor.test.ts`
- `packages/nuxt-mcp-toolkit/test/fixtures/sessions/server/mcp/index.ts`

We added or updated coverage for:
- malformed session ID returns `400`
- cross-scheme origin rejection
- deferred session invalidation behavior
- code mode token extraction under JSON-stringified output

### Why this mattered

These tests lock in the behavior that was previously missing or incorrect and prevent regression in the most security-sensitive parts of the change set.

## 14. Files Changed

### Runtime / module

- `packages/nuxt-mcp-toolkit/src/module.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/config.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/logging.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/session-state.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/node.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/cloudflare.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/providers/security.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/definitions/resources.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/definitions/handlers.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/deeplink.ts`
- `packages/nuxt-mcp-toolkit/src/runtime/server/mcp/codemode/executor.ts`

### Docs

- `apps/docs/content/1.getting-started/3.configuration.md`
- `apps/docs/content/3.advanced/6.sessions.md`
- `apps/docs/content/4.examples/1.authentication.md`

### Tests / fixtures

- `packages/nuxt-mcp-toolkit/test/sessions.test.ts`
- `packages/nuxt-mcp-toolkit/test/codemode-executor.test.ts`
- `packages/nuxt-mcp-toolkit/test/fixtures/sessions/server/mcp/index.ts`

## 15. Verification Performed

Ran:

```bash
pnpm --filter @nuxtjs/mcp-toolkit exec vitest run test/sessions.test.ts
pnpm --filter @nuxtjs/mcp-toolkit exec vue-tsc --noEmit
```

Results:
- session regression suite passed
- typecheck passed

## 16. Net Outcome

This staged change set now does the following:
- adds configurable origin validation with a safe default
- closes the resource path traversal hole
- validates session IDs explicitly
- caps session growth
- makes session invalidation portable and safe for the current request
- documents auth behavior more accurately
- documents session continuity vs true resumability correctly
- hardens generated code interpolation in code mode
- exposes MCP logging as a composable
- clarifies unsupported handler routing behavior
- adds targeted regression coverage for the critical paths
