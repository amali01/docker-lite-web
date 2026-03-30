# DockLite Web Product Vision

## Product Goal

Build a lightweight Docker UI that works alongside the Docker CLI and removes the need for Docker Desktop on local Ubuntu machines when the user mainly wants a fast GUI in the browser.

## Principles

- Browser-first user experience
- Local-first deployment
- Lighter than Docker Desktop in memory, storage, and startup cost
- CLI-compatible mental model, not a parallel abstraction
- Fast common workflows before broad feature count

## MVP Scope

The first release should assume:

- Same device only
- Ubuntu host
- Local Docker Engine already installed
- Browser UI served from the same machine

The MVP should cover these high-value workflows:

- View engine status and system information
- List containers, images, volumes, and networks
- Start, stop, restart, remove, and inspect containers
- View streaming logs
- Create and run a container with common options
- Pull and remove images
- Create and remove volumes and networks where safe
- Surface connection errors and permission problems clearly

## Explicit Non-Goals For MVP

- Kubernetes integration
- Docker Hub account features
- Cloud/off-device orchestration
- Swarm management
- Full Compose authoring UI
- Registry browser
- Deep build pipeline tooling

Those can come later, but they should not delay a strong same-device local experience.

## Architectural Reality

A browser cannot directly access `/var/run/docker.sock`. That means the product needs two parts:

- A web frontend
- A lightweight local bridge process that talks to Docker on Ubuntu

Good MVP choices for the bridge:

- Node.js service using Docker Engine API access over the Unix socket
- Go service for smaller footprint and simpler system distribution

Either approach is acceptable. The important part is that the browser only talks to the local bridge, never to the Unix socket directly.

## UX Direction

The UI should feel:

- Immediate
- Legible under high resource churn
- Close to Docker concepts users already know
- Capable without feeling bulky

The existing prototype already points in the right direction:

- Resource-oriented sidebar
- Dense tables
- Terminal-inspired typography
- Low-friction operational actions

## Engineering Direction

The frontend should evolve toward:

- A typed API client
- Query/mutation hooks per resource
- Reusable domain models separated from page components
- Streaming support for logs, stats, and progress
- Clear disconnected/error states

The backend should evolve toward:

- Docker Engine adapter layer
- Resource-specific endpoints
- WebSocket or SSE streams for logs and events
- Permission-aware startup and diagnostics
- Strong mapping between Docker errors and user-facing errors
