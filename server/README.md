# DockLite Backend

The backend is a lightweight local bridge between the browser UI and Docker on Ubuntu.

## Modes

- Default: real Docker adapter over `/var/run/docker.sock`
- Mock: in-memory adapter for tests and smoke runs

## Run

```bash
pnpm server:dev
```

Mock mode:

```bash
pnpm server:dev:mock
```
