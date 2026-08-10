# Report Flow — Build Workflow

Panduan lengkap workflow build dari awal sampai selesai, berdasarkan PRD dan task breakdown yang sudah dibuat.

---

## Installed Skills

Skill yang sudah diinstall untuk membantu build:

| Skill                           | Purpose                            | Source                                           |
| ------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `react-pdf`                     | PDF rendering guidelines           | vercel-labs/json-render (1.8K installs)          |
| `supabase`                      | Supabase patterns & best practices | supabase/agent-skills (208K installs)            |
| `tanstack-start-best-practices` | TanStack Start SSR patterns        | deckardger/tanstack-agent-skills (8.7K installs) |
| `api-authentication`            | API key auth patterns              | secondsky/claude-skills (427 installs)           |

---

## Task Structure

```
.tmp/tasks/
├── pdf-generation-engine/        # Phase 1 (5 subtasks)
├── api-key-auth/                 # Phase 2 (5 subtasks)
├── phase3-editor-improvements/   # Phase 3 (8 subtasks)
├── batch-generation-webhooks/    # Phase 4+5 (8 subtasks)
├── phase-6-mcp-server/           # Phase 6 (3 subtasks)
├── phase-7-team-management/      # Phase 7 (5 subtasks)
└── phase-8-polish/               # Phase 8 (4 subtasks)
```

**Total: 38 subtasks across 8 phases**

---

## Dependency Graph (Full)

```
Phase 1 (PDF Engine) ─────────────────────────────────────────────────┐
  01 Install PDF dep ──┐                                              │
  02 Documents table ──┤                                              │
  03 PDF render svc ───┤                                              │
  04 Server function ──┤                                              │
  05 UI button ────────┘                                              │
                                                                      │
Phase 2 (API Keys) ────── paralel dengan Phase 1 ─────────────────────┤
  01 Migration ──┐                                                    │
  02 Server fn ──┤                                                    │
  03 Middleware ──┤  paralel                                           │
  04 UI ─────────┘                                                    │
  05 Wire to generate ── butuh Phase 1.04 ────────────────────────────┤
                                                                      │
Phase 3 (Editor) ──────── paralel dengan Phase 1-2 ──────────────────┤
  01 Undo/redo hook ──┐                                               │
  02 UI + shortcuts ──┘                                               │
  03-08 Independent tasks (paralel semua)                              │
                                                                      │
Phase 4 (Batch) ──────── butuh Phase 1 selesai ──────────────────────┤
  01 Migration ──┐                                                    │
  02 Create fn ──┤                                                    │
  03 Worker ─────┤                                                    │
  04 Status fn ──┤ paralel                                            │
  05 UI ─────────┘                                                    │
                                                                      │
Phase 5 (Webhooks) ────── paralel dengan Phase 4 ────────────────────┤
  01 Migration ──┐                                                    │
  02 Delivery ───┤ butuh Phase 4.03 (worker)                          │
  03 UI ─────────┘ paralel                                            │
                                                                      │
Phase 6 (MCP) ────────── butuh Phase 1 + 2 ─────────────────────────┤
  01 Setup ──┐                                                        │
  02 Tools ──┤                                                        │
  03 Guide ──┘                                                        │
                                                                      │
Phase 7 (Team) ────────── independent, bisa mulai kapan saja ────────┤
  01 Migration ──┐                                                    │
  02 Server fn ──┤                                                    │
  03 Team UI ────┤                                                    │
  04 Workspace ──┤ paralel setelah 03                                  │
  05 Profile ────┘                                                    │
                                                                      │
Phase 8 (Polish) ──────── terakhir ──────────────────────────────────┘
  01 Export/Import ──┐ paralel
  02 Doc history ────┤
  03 Error bounds ───┤
  04 Responsive ─────┘ butuh 02
```

---

## Execution Waves

### Wave 1 — Foundation (paralel)

| Task                          | Feature                | Agent                  |
| ----------------------------- | ---------------------- | ---------------------- |
| pdf-generation-engine/01      | Install PDF dep        | CoderAgent             |
| pdf-generation-engine/02      | Documents table        | CoderAgent             |
| api-key-auth/01               | Api_keys migration     | CoderAgent             |
| phase3-editor-improvements/01 | Undo/redo hook         | CoderAgent             |
| phase3-editor-improvements/03 | Conditional visibility | OpenFrontendSpecialist |
| phase3-editor-improvements/04 | Rename/lock            | OpenFrontendSpecialist |
| phase3-editor-improvements/05 | Font selector          | OpenFrontendSpecialist |
| phase3-editor-improvements/06 | Image upload           | CoderAgent             |
| phase3-editor-improvements/07 | Version history        | CoderAgent             |
| phase3-editor-improvements/08 | Search/filter          | OpenFrontendSpecialist |
| phase7-team-management/01     | Invitations migration  | CoderAgent             |

### Wave 2 — Core Logic

| Task                          | Feature             | Agent      |
| ----------------------------- | ------------------- | ---------- |
| pdf-generation-engine/03      | PDF render service  | CoderAgent |
| api-key-auth/02               | Key management fn   | CoderAgent |
| api-key-auth/03               | API auth middleware | CoderAgent |
| phase3-editor-improvements/02 | Undo/redo UI        | CoderAgent |
| phase7-team-management/02     | Invitation fn       | CoderAgent |

### Wave 3 — Integration

| Task                         | Feature             | Agent                  |
| ---------------------------- | ------------------- | ---------------------- |
| pdf-generation-engine/04     | Generate server fn  | CoderAgent             |
| api-key-auth/04              | Developer portal UI | OpenFrontendSpecialist |
| phase7-team-management/03    | Team management UI  | OpenFrontendSpecialist |
| batch-generation-webhooks/01 | Batches migration   | CoderAgent             |
| batch-generation-webhooks/06 | Webhooks migration  | CoderAgent             |

### Wave 4 — Features

| Task                         | Feature            | Agent                  |
| ---------------------------- | ------------------ | ---------------------- |
| pdf-generation-engine/05     | Generate UI button | OpenFrontendSpecialist |
| api-key-auth/05              | Wire to generate   | CoderAgent             |
| batch-generation-webhooks/02 | Batch creation fn  | CoderAgent             |
| batch-generation-webhooks/04 | Batch status fn    | CoderAgent             |
| batch-generation-webhooks/08 | Webhook UI         | OpenFrontendSpecialist |
| phase6-mcp-server/01         | MCP setup          | CoderAgent             |
| phase7-team-management/04    | Workspace settings | OpenFrontendSpecialist |
| phase7-team-management/05    | Profile management | OpenFrontendSpecialist |

### Wave 5 — Async + MCP

| Task                         | Feature          | Agent                  |
| ---------------------------- | ---------------- | ---------------------- |
| batch-generation-webhooks/03 | Batch worker     | CoderAgent             |
| batch-generation-webhooks/05 | Batch UI page    | OpenFrontendSpecialist |
| batch-generation-webhooks/07 | Webhook delivery | CoderAgent             |
| phase6-mcp-server/02         | MCP tools        | CoderAgent             |

### Wave 6 — Polish

| Task                 | Feature           | Agent                  |
| -------------------- | ----------------- | ---------------------- |
| phase6-mcp-server/03 | MCP guide page    | OpenFrontendSpecialist |
| phase8-polish/01     | Export/Import     | CoderAgent             |
| phase8-polish/02     | Document history  | OpenFrontendSpecialist |
| phase8-polish/03     | Error boundaries  | CoderAgent             |
| phase8-polish/04     | Responsive mobile | OpenFrontendSpecialist |

---

## How to Track Progress

```bash
# Check overall status
bash .opencode/skills/task-management/router.sh status

# Find next eligible tasks
bash .opencode/skills/task-management/router.sh next

# Mark task complete
bash .opencode/skills/task-management/router.sh complete <feature> <seq> "summary"

# Validate all tasks
bash .opencode/skills/task-management/router.sh validate
```

---

## Key Conventions (from AGENTS.md)

- **Path alias**: `@/*` → `./src/*`
- **Server-only**: Name files `*.server.ts`, never import `server-only`
- **Vite config**: Do NOT add plugins to `vite.config.ts` — Lovable config handles it
- **routeTree.gen.ts**: Never edit — auto-generated by TanStack Router
- **Supabase**: `client.ts` for browser (RLS), `client.server.ts` for admin (bypasses RLS)
- **Lint**: `npm run lint` — 0 errors expected
- **Format**: `npm run format` — Prettier with 100 char width, double quotes
- **No tests**: There is no test script

---

## PRD Alignment Checklist

| PRD Section                | Phase            | Status          |
| -------------------------- | ---------------- | --------------- |
| Visual Template Editor     | 3 (improvements) | Partially built |
| Document Generation (sync) | 1                | Not started     |
| REST API                   | 2 (API keys)     | Not started     |
| MCP Server                 | 6                | Not started     |
| Auth (API keys)            | 2                | Not started     |
| Auth (OAuth)               | —                | Deferred        |
| Dashboard pages            | 3, 5, 7, 8       | Partially built |
| Async batch                | 4                | Not started     |
| Webhooks                   | 5                | Not started     |
| Team management            | 7                | Not started     |
| Usage & billing            | —                | Deferred        |
