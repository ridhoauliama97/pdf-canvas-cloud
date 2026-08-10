<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Project overview

**Report Flow** — a SaaS app for designing document templates visually and generating PDFs via REST API or MCP. Built with TanStack Start (SSR), Supabase, shadcn/ui, React 19.

## Commands

```sh
npm run dev        # vite dev server
npm run build      # vite build (production, targets cloudflare/nitro)
npm run build:dev  # vite build --mode development
npm run lint       # eslint .
npm run format     # prettier --write .
```

No test suite exists. There is no `test` script.

## Critical: Vite config

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which bundles **many plugins** (TanStack Start, React, Tailwind v4, tsconfig paths, Nitro, env injection, etc.). Do NOT add duplicate plugins — it will break the build.

## Path alias

`@/*` → `./src/*` (defined in both `tsconfig.json` and the Lovable vite config). Use `@/` for all imports.

## Server-only code

- TanStack Start does **not** use `server-only`. Name modules `*.server.ts` instead.
- ESLint forbids `import "server-only"` with an error.
- `src/server.ts` is the SSR entry (error handling wrapper around TanStack's server entry).
- `src/start.ts` configures middleware: CSRF protection, Supabase auth attachment, error handling.

## Supabase clients

Two clients exist, both lazy-initialized via Proxy:

- **`client.ts`** — browser/SSR client. Uses `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (or `process.env` for SSR). Respects RLS.
- **`client.server.ts`** — service-role client. Uses `SUPABASE_SERVICE_ROLE_KEY`. **Bypasses RLS.** Only import inside `*.server.ts` files or dynamic imports in server functions.

## Routing conventions

- TanStack Router with file-based routing. `src/routeTree.gen.ts` is auto-generated — never edit it.
- `_authenticated.tsx` = auth gate layout (redirects to `/auth` if no session).
- `_authenticated.templates.index.tsx` = `/templates` list.
- `_authenticated.templates.$templateId.tsx` = `/templates/:id` editor.
- Root layout in `__root.tsx` wraps everything with QueryClientProvider + AuthProvider + Toaster.

## UI layer

- **shadcn/ui** (new-york style, slate base, CSS variables). Components in `src/components/ui/`.
- **Editor** is custom canvas code in `src/components/editor/` — not a library.
- Tailwind CSS v4 (via `@tailwindcss/vite`). Styles in `src/styles.css`.
- Dark mode is always on (`<html lang="dark">`).

## Lint/format

- ESLint: flat config in `eslint.config.js`. Ignores `dist`, `.output`, `.vinxi`.
- Prettier: 100 char width, semicolons, double quotes, trailing commas. Ignores `routeTree.gen.ts`.
- `noUnusedLocals` and `noUnusedParameters` are **off** in tsconfig.

## Bun config

`bunfig.toml` has a 24-hour supply-chain guard (`minimumReleaseAge = 86400`). Lovable packages are excluded. If adding a new dependency, confirm with the user before bypassing the guard.

## Auth flow

- Client-side: `useAuth()` hook (React context) wraps Supabase `onAuthStateChange`.
- `_authenticated` layout redirects unauthenticated users to `/auth`.
- Server functions: `attachSupabaseAuth` middleware (in `src/start.ts`) attaches user session.

## Database

- Supabase migrations in `supabase/migrations/`.
- Tables are multi-tenant scoped by `company_id` with RLS.
- Key tables: `companies`, `templates`, `template_versions`, `documents`, `batches`, `api_keys`, `webhooks`.
