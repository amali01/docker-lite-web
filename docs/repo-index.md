# DockLite Web Repo Index

## What This App Is

This repository is a frontend-first prototype for a lightweight Docker Desktop alternative.

The current app already models the core resource areas users expect:

- Dashboard
- Containers
- Images
- Volumes
- Networks
- Docker connection settings

The app is not yet wired to a real Docker backend. Every screen is driven by mock state, local React state, and optimistic UI actions.

## Product Direction

The intended product is:

- Faster and lighter than Docker Desktop
- Browser-based
- Able to run locally on the same Ubuntu machine as Docker
- Capable of covering the common Docker Desktop workflows without replacing the Docker CLI

Important constraint:

- A browser app cannot directly open `unix:///var/run/docker.sock`
- The MVP therefore needs a small local bridge service on the same machine that talks to the Docker Engine and exposes a safe HTTP/WebSocket API to the web UI

## Tech Stack

- Vite 5
- React 18
- TypeScript
- Tailwind CSS
- `shadcn/ui` and Radix UI
- React Router
- TanStack Query, currently unused for real data fetching
- Vitest + Testing Library
- Playwright config present but not yet used for meaningful product coverage

## File Map

### App Shell

- [`src/main.tsx`](../src/main.tsx): React bootstrap and font imports
- [`src/App.tsx`](../src/App.tsx): providers, router, and top-level routes
- [`src/components/AppLayout.tsx`](../src/components/AppLayout.tsx): shell layout with sidebar and routed content
- [`src/components/AppSidebar.tsx`](../src/components/AppSidebar.tsx): main navigation and hardcoded engine status indicator

### Pages

- [`src/pages/Dashboard.tsx`](../src/pages/Dashboard.tsx): summary cards, system info, and container table
- [`src/pages/Containers.tsx`](../src/pages/Containers.tsx): filterable container list, mock lifecycle actions, log panel toggle, and run dialog
- [`src/pages/Images.tsx`](../src/pages/Images.tsx): filterable image list and mock deletion/copy actions
- [`src/pages/Volumes.tsx`](../src/pages/Volumes.tsx): filterable volume list and guarded deletion
- [`src/pages/Networks.tsx`](../src/pages/Networks.tsx): filterable network list and guarded deletion for default networks
- [`src/pages/DockerSettings.tsx`](../src/pages/DockerSettings.tsx): placeholder connection UI for Docker socket/API endpoint
- [`src/pages/NotFound.tsx`](../src/pages/NotFound.tsx): route fallback
- [`src/pages/Index.tsx`](../src/pages/Index.tsx): unused Lovable placeholder page

### Domain and Mock Data

- [`src/lib/mock-data.ts`](../src/lib/mock-data.ts): all current domain types and mock resources

Current domain types already cover:

- Containers
- Images
- Volumes
- Networks
- System info

This file is effectively the temporary contract for the app.

### Reusable Product Components

- [`src/components/StatusBadge.tsx`](../src/components/StatusBadge.tsx): visual state pill for container status
- [`src/components/StatCard.tsx`](../src/components/StatCard.tsx): dashboard stat card
- [`src/components/ContainerLogs.tsx`](../src/components/ContainerLogs.tsx): simulated streaming logs viewer
- [`src/components/RunContainerDialog.tsx`](../src/components/RunContainerDialog.tsx): prototype container creation form using local-only state

### Generated UI Layer

- [`src/components/ui`](../src/components/ui): mostly generated `shadcn/ui` primitives

Only a small subset is actually used. Most files in this folder are scaffolding rather than product logic.

### Styling and Config

- [`src/index.css`](../src/index.css): design tokens, dark industrial palette, font tokens, scrollbar styling
- [`tailwind.config.ts`](../tailwind.config.ts): token mapping and custom animation
- [`vite.config.ts`](../vite.config.ts): Vite config, path alias, port `8080`
- [`vitest.config.ts`](../vitest.config.ts): test setup for jsdom and `@/` alias
- [`eslint.config.js`](../eslint.config.js): baseline TypeScript + React linting

## Current Runtime Behavior

### Dashboard

- Reads all data from `mock-data.ts`
- Shows Docker version, API version, system information, and container table

### Containers

- Supports filtering by name or image
- Simulates start, stop, restart, remove, logs, and terminal actions
- Maintains state only in component memory
- Uses `RunContainerDialog` to prepend a synthetic container to the list

### Images

- Supports filtering by repository and tag
- Simulates image removal
- Copies image IDs to the clipboard

### Volumes and Networks

- Support filtering and guarded deletion rules
- Deletion is in-memory only

### Settings

- Suggests direct Docker Engine connectivity
- Does not yet persist settings or validate real connections

## Gaps Against the Vision

### Backend Gap

There is no service layer yet. For the local-Ubuntu MVP, this is the main missing subsystem.

### Data Flow Gap

TanStack Query is installed, but the app does not yet use query hooks, mutations, polling, streaming, or cache invalidation.

### Domain Gap

The domain model is too small for Docker parity. Missing examples:

- Container inspect data
- Real container create/run options
- Exec sessions
- Live stats
- Build and pull progress
- Compose projects
- Events stream
- Error states from the engine

### UX Gap

The prototype captures the page structure, but not production workflows such as:

- Real-time refresh
- Disabled states during mutations
- Confirmation flows for destructive actions
- Engine disconnected state
- Permission and socket access failures

## Recommended Near-Term Architecture

For the local MVP on Ubuntu:

1. Keep the existing React app as the browser UI.
2. Add a lightweight local backend on the same machine.
3. Have the backend talk to Docker through the local Unix socket or through the Docker CLI where appropriate.
4. Expose a constrained HTTP/WebSocket API to the frontend.
5. Move page state from mock arrays into query hooks and mutations.

Practical implication:

- The product is not "frontend only"
- It is a local web app plus a local Docker bridge

## Testing Status

Current tests cover:

- Dashboard rendering
- Containers page rendering and filtering
- StatusBadge
- ContainerLogs
- Mock data sanity

Current limitations:

- No tests for a real API layer because none exists yet
- No end-to-end product tests for engine-backed flows
- Playwright is configured but not yet productized

## Suggested Work Order

1. Introduce a real local API layer for Ubuntu Docker Engine access.
2. Define typed API contracts that replace `mock-data.ts` as the UI contract.
3. Migrate pages one resource at a time from mock state to real queries/mutations.
4. Add streaming support for logs, events, and progress updates.
5. Expand into inspect, exec, Compose, and richer settings after the core CRUD flows are stable.
