---
name: docklite-repo-onboarding
description: Use when starting work in this repository to quickly understand the current frontend prototype, its file map, and its architectural gaps.
---

# DockLite Repo Onboarding

Use this skill when you need fast, accurate context on the current state of the DockLite Web codebase.

## Purpose

This repository is not yet a real Docker product. It is a frontend prototype that models the intended Docker Desktop replacement UX using in-memory mock data.

You should treat the repo as:

- A product skeleton worth preserving
- A domain/UI prototype
- Not yet a real Docker Engine client

## Read First

1. `README.md`
2. `docs/repo-index.md`
3. `docs/product-vision.md`
4. `src/App.tsx`
5. `src/lib/mock-data.ts`

## Current Shape

- App shell and routing are already established
- Main product pages exist for Dashboard, Containers, Images, Volumes, Networks, and Settings
- Most product behavior lives in `src/pages`
- Shared product components live in `src/components`
- `src/components/ui` is mostly generated `shadcn/ui` infrastructure

## Important Constraints

- The current app uses mock data only
- There is no backend and no Docker Engine integration
- A browser cannot directly access `/var/run/docker.sock`
- Any real same-device MVP requires a local backend or bridge service

## Working Rules

- Preserve the existing sidebar/resource mental model unless the user asks for a redesign
- Prefer editing product files over generated `ui` primitives when possible
- Avoid spreading new Docker logic into page components; create a typed API layer first
- Keep Ubuntu local-machine assumptions explicit in docs and code

## High-Value Files

- `src/pages/Containers.tsx`
- `src/components/RunContainerDialog.tsx`
- `src/components/ContainerLogs.tsx`
- `src/pages/DockerSettings.tsx`
- `src/lib/mock-data.ts`

These files represent the most important MVP flows and the clearest migration path to a real engine-backed product.

## When This Skill Is Not Enough

If the task is about implementing the actual local Docker MVP, also use:

- `.agents/skills/docklite-local-docker-mvp/SKILL.md`
