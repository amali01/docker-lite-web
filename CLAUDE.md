# Working rules for Claude in this repo

Project overview, architecture, stack, and setup live in `README.md` and
`server/README.md`. This file is not documentation — it is the rulebook for how
to work here: how to scope, route, validate, and behave.

## Orchestration

- Claude owns scope, routing, integration, and the final answer even when work
  is delegated. Verify delegated results yourself — an agent or tool report is
  not proof.
- Prefer the smallest complete solution; propose the simpler approach if one
  exists. If a request is too large for one safe unit, split it and say so.

## Codebase discovery

- Graph first, files second: codebase-memory MCP (`search_graph`, `trace_path`,
  `get_code_snippet`); Grep for strings/configs/non-code. `graphify-out/`
  (`graphify query|path|explain`) is the fallback; refresh with
  `/graphify . --update` after meaningful changes.

## Skills

Route to skills instead of re-deriving process: bugs → `diagnosing-bugs`,
implementation → `/implement` / `/tdd`, branch/PR review → `/code-review`
(explicit fixed point), unclear flow → `/ask-matt`. Frontend/UI work always uses
`frontend-design:frontend-design` + `impeccable` together. Skip workflows for
trivial direct tasks.

## Picking the right model for delegated work

Rankings, higher = better. Intelligence is how hard a problem the model can take
unsupervised; taste covers UI/UX, code quality, API design, copy.

| model | cost | intelligence | taste | use for |
|---|---:|---:|---:|---|
| Codex GPT | 9 (near-free) | 8 | 5 | bulk/mechanical: clear-spec implementation, data analysis, migrations, bounded investigation, extra review perspective |
| `haiku` | 8 | 3 | 3 | trivial mechanical fan-out only: file listing, grep-and-report, format checks |
| `sonnet` | 5 | 5 | 7 | self-contained subtasks: codebase searches, scoped refactors, test writing, codex wrapper agents |
| `opus` | 4 | 7 | 8 | reviews, planning, moderate design/copy work in subagents |
| session model | 2 | 9 | 9 | product judgment, UX, architecture, domain modeling, final synthesis — usually the main agent itself |

- Route each delegated task to the cheapest row whose intelligence/taste meets
  the bar. Defaults, not limits: if a cheaper model's output misses the bar,
  redo with a smarter one without asking — escalating costs less than shipping
  mediocre work.
- Cost is a tie-breaker only; for anything that ships, intelligence > taste >
  cost. User-facing output (UI, copy, API design) needs taste ≥ 7.
- Parallel agents only for independent, non-overlapping scopes; parallel writers
  use isolated worktrees.
- Delegated prompts are self-contained: objective, paths, constraints,
  acceptance criteria, verification, output format.

## Codex (GPT) mechanics

- The direct Codex CLI is the default GPT route; the `/codex:review` and
  `/codex:adversarial-review` plugin commands are a supervised backup only.
  Claude invokes Codex from Bash and remains accountable for validating its
  output — treat Codex findings as evidence, not authority.
- Every direct non-interactive invocation must close inherited stdin with
  `< /dev/null`, and run under a hard `timeout` with an event log; success
  requires exit status 0 and a non-empty final report.
- Investigation: `codex exec --ephemeral -s read-only`; implementation:
  `codex exec -s workspace-write` in an isolated worktree; review: follow the
  `codex-cli` skill exactly. Never improvise flags or use
  `--dangerously-bypass-approvals-and-sandbox`.
- Inventory and scope the target before invoking Codex; use a scoped diff
  artifact when unrelated pending work exists (a blanket working-tree review
  does not filter its target).

## GPT review gate

Substantive work (behavior, APIs, schemas, config, security, data, multi-step
plans) gets an independent Codex review at every material stage: the plan before
implementation, each independently risky slice, and the final integrated diff.
Status-only updates and trivial direct tasks are exempt. The implementer never
self-certifies. Cap at ~3 fix/re-review rounds, then escalate. If both the CLI
and plugin fallback fail, report the gate as blocked — a Claude self-review does
not substitute.

## TypeScript

- No `any` unless genuinely unavoidable; prefer `unknown`, generics, narrowed
  unions, domain types.
- No speculative abstractions or unrelated refactors; follow existing patterns;
  never silently swallow errors.

## Validation

- pnpm only — never npm or yarn.
- Don't start dev servers or full builds unless asked or verification requires it.
- Never claim a check passed without running it and reading the output. Checks:
  `pnpm lint` · `pnpm exec tsc -p tsconfig.app.json --noEmit` ·
  `pnpm server:typecheck` · `pnpm test` · `pnpm server:test` · `pnpm build` ·
  `pnpm test:e2e`.
- `pnpm dev:mock` is the standard testing ground — an in-memory adapter
  (`DOCKLITE_ADAPTER=mock`), no Docker daemon needed; `pnpm dev:full` runs the
  real adapter over `/var/run/docker.sock`.

## Secrets & runtime state

- Never commit secrets or runtime state. These are gitignored and regenerated at
  startup: `server/data/auth-config.json` (JWT secret + admin hash),
  `server/data/engine-targets.json`, `server/data/tls/`, `server/.env`
  (template: `server/.env.example`). Never hardcode `jwtSecret`.

## Git

- Preserve unrelated staged/unstaged/untracked work — never stash, reset, or
  include it without permission.
- **Never add Claude/Anthropic as a co-author or attribution** anywhere, in any
  form.
- No commit, push, PR, or issue-state change unless the user asks or the active
  workflow requires it.

## Completion report

State what changed, what was delegated to whom, which checks ran with outcomes,
and the GPT review result. Call out anything unverified or blocked — never
report complete while a required gate hasn't passed.
