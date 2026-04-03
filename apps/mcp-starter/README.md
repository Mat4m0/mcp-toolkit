# Nuxt MCP Starter

Minimal Nuxt 4 app with [@nuxtjs/mcp-toolkit](https://mcp-toolkit.nuxt.dev) — one tool, one resource, one prompt — meant to be copied **alone** via **giget** or **tiged**. MCP definitions use **explicit** imports from `@nuxtjs/mcp-toolkit/server` (and Zod), matching the docs.

## Use this template (standalone)

Downloads **only** `apps/mcp-starter` from GitHub:

```bash
npx giget@latest gh:nuxt-modules/mcp-toolkit/apps/mcp-starter my-nuxt-mcp
cd my-nuxt-mcp
pnpm install
pnpm dev
```

With [tiged](https://github.com/tiged/tiged):

```bash
npx tiged@latest nuxt-modules/mcp-toolkit/apps/mcp-starter my-nuxt-mcp
cd my-nuxt-mcp
pnpm install
pnpm dev
```

- Site: [http://localhost:3000](http://localhost:3000)
- MCP (HTTP): `http://localhost:3000/mcp`

`@nuxtjs/mcp-toolkit` comes from **npm** (`^0.13.3`), so the published package already includes the `server` build — no extra step.

Hook up Cursor, VS Code, or other clients using [Connection](https://mcp-toolkit.nuxt.dev/getting-started/connection) in the docs.

## Develop inside this monorepo (contributors)

`pnpm dev:prepare` **stubs** the module and removes `dist/runtime/...`, so **`@nuxtjs/mcp-toolkit/server` does not resolve** until you build the module.

From the repository root:

```bash
pnpm install
pnpm run dev:prepare
pnpm run build:module
pnpm run dev:starter
```

The root `pnpm.overrides` keeps `@nuxtjs/mcp-toolkit` on the **workspace** package while this app’s `package.json` still declares `^0.13.3` for giget/tiged users.

## What’s inside

| Kind      | Name           | Purpose |
|-----------|----------------|--------|
| Tool      | `ping`         | Simple echo / health check |
| Resource  | `starter-info` | `starter://info` — where to add definitions |
| Prompt    | `iterate`      | Short bootstrap prompt for an assistant |

## Blog prompt

[PROMPT.md](./PROMPT.md) is a **short paste** for an assistant (giget/tiged + doc link + explicit imports + “ask what I want next”).

## Deploy

Deploy like any Nuxt app on [Vercel](https://vercel.com) or your host of choice. The MCP route is served by Nitro; check timeouts for long-running tools.
