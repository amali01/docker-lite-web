# DockLite Backend

The backend is a lightweight local bridge between the browser UI and Docker on Linux.

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

## Defaults

- Binds `127.0.0.1:9001` in development. The installed desktop app uses port `9010`.
- Seeds an admin from `DOCKLITE_ADMIN_USERNAME` / `DOCKLITE_ADMIN_PASSWORD`, falling back to `admin` / `admin`.
- On a loopback bind, a fresh install skips the login wall (see `runtime/config.ts` `allowAuthBypass`). A non-loopback bind always requires login.

Auth, remote engine targets, and the desktop app install are covered in the [root README](../README.md).
