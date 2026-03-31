---
name: docklite-repo-onboarding
description: Use when starting work in this repository to quickly understand the current local web app, its frontend/backend file map, and its remaining gaps.
---

# DockLite Repo Onboarding

Use this skill when you need fast, accurate context on the current state of the DockLite Web codebase.

## Purpose

This repository is a local Docker web app for Ubuntu with a real backend bridge plus a mock mode for tests and UI work.

You should treat the repo as:

- A real frontend/backend product slice
- Still MVP-quality rather than fully productized
- Capable of running against a real local Docker Engine or a mock adapter

## Read First

1. `README.md`
2. `docs/repo-index.md`
3. `docs/product-vision.md`
4. `src/App.tsx`
5. `src/lib/api/resources.ts`
6. `server/src/index.ts`
7. `server/src/docker/client.ts`

## Current Shape

- App shell and routing are established
- Main product pages exist for Dashboard, Containers, Images, Volumes, Networks, and Settings
- Frontend state is driven through typed API helpers and React Query hooks
- A local backend in `server/` provides Docker and mock adapters
- `src/components/ui` is mostly generated `shadcn/ui` infrastructure

## Important Constraints

- A browser cannot directly access `/var/run/docker.sock`
- The real product therefore depends on the local backend bridge
- Mock mode still matters because it underpins tests and smoke runs
- Ubuntu same-machine assumptions should remain explicit in code and docs

## Working Rules

- Preserve the existing sidebar/resource mental model unless the user asks for a redesign
- Prefer editing product files over generated `ui` primitives when possible
- Avoid spreading raw Docker logic into page components; keep it in the API layer and backend adapter
- Keep Ubuntu local-machine assumptions explicit in docs and code

## High-Value Files

- `src/pages/Containers.tsx`
- `src/components/ContainerLogs.tsx`
- `src/components/ContainerExec.tsx`
- `src/pages/DockerSettings.tsx`
- `src/lib/api/resources.ts`
- `server/src/docker/client.ts`
- `server/src/engine-controller.ts`

These files represent the most important MVP flows and the highest-leverage backend/frontend integration points.

## When This Skill Is Not Enough

If the task is about expanding or hardening the same-device local Docker MVP, also use:

- `.agents/skills/docklite-local-docker-mvp/SKILL.md`
