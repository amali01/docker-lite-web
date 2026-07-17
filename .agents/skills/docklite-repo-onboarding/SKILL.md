---
name: docklite-repo-onboarding
description: Use when starting work in this repository to quickly understand the current local web app, its frontend/backend file map, and its remaining gaps.
---

# DockLite Repo Onboarding

Use this skill when you need fast, accurate context on the current state of the DockLite Web codebase.

## Purpose

This repository is a local-first Docker web app for Linux/Ubuntu with a real backend bridge plus a mock mode for tests and UI work. The same-device MVP is delivered; work now is hardening and extending it.

You should treat the repo as:

- A real frontend/backend product slice, past its initial MVP
- Local-first by default, but able to manage remote engine targets over SSH or TCP-TLS
- Gated behind local admin auth (argon2 + JWT), with a loopback login bypass
- Capable of running against a real local Docker Engine or a mock adapter

## Read First

1. `README.md`
2. `docs/repo-index.md` — the canonical, maintained file map; start here for anything not covered below
3. `docs/product-vision.md`
4. `src/App.tsx`
5. `src/lib/api/resources.ts`
6. `server/src/index.ts` — process entry: HTTP + WebSocket wiring, auth, engine manager
7. `server/src/app.ts` — Express app; where the per-resource routers mount
8. `server/src/docker/client.ts`

## Current Shape

- App shell and routing are established, behind a `Login` page and auth gate
- Product pages exist for Dashboard, Containers (+ Container details), Images, Volumes, Networks, and Docker Settings
- Frontend state is driven through typed API helpers and TanStack Query hooks (`src/hooks/use-*.ts`)
- A local backend in `server/` (Express 5 + `ws`, `dockerode`) provides Docker and mock adapters, split into per-resource routers under `server/src/routes/`
- Auth lives in `server/src/auth/`; local + remote engine targets are managed by `server/src/engine-manager.ts` and `server/src/engine-targets/`
- `src/components/ui` is mostly generated `shadcn/ui` infrastructure

## Important Constraints

- A browser cannot directly access `/var/run/docker.sock`
- The real product therefore depends on the local backend bridge
- Mock mode still matters because it underpins tests and smoke runs
- Local-first, same-device is the default; remote engine targets are an opt-in capability, not a reason to drop the loopback/same-machine assumptions baked into auth and the bridge

## Working Rules

- Preserve the existing sidebar/resource mental model unless the user asks for a redesign
- Prefer editing product files over generated `ui` primitives when possible
- Avoid spreading raw Docker logic into page components; keep it in the API layer and backend adapter
- Keep Ubuntu local-machine assumptions explicit in docs and code

## High-Value Files

- `src/pages/Containers.tsx` and `src/pages/ContainerDetails.tsx`
- `src/components/ContainerLogs.tsx`
- `src/components/ContainerExec.tsx`
- `src/pages/DockerSettings.tsx`
- `src/pages/Login.tsx`
- `src/lib/api/resources.ts`
- `server/src/docker/client.ts`
- `server/src/engine-manager.ts`
- `server/src/routes/engine.ts`
- `server/src/auth/middleware.ts`

These files represent the most important product flows and the highest-leverage backend/frontend integration points.

## When This Skill Is Not Enough

For the deep, maintained file map (every page, hook, route, and adapter), read `docs/repo-index.md`.

`.agents/skills/docklite-local-docker-mvp/SKILL.md` documents the original same-device MVP plan; that build is complete, so treat it as background on the architectural constraints (bridge model, no direct socket access) rather than an active task list.
