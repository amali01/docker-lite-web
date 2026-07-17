#!/usr/bin/env bash
# Build DockLite from this repo and install it as a standalone desktop app under
# ~/.local (XDG user dirs). Re-running upgrades in place; user data survives.
# The installed app never reads from the repo again.
set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARE_DIR="${DOCKLITE_INSTALL_ROOT:-$HOME/.local/share/docklite}"
APP_DIR="$SHARE_DIR/app"
DATA_DIR="$SHARE_DIR/data"
STAGE_DIR="$SHARE_DIR/app.stage"
BIN_PATH="$HOME/.local/bin/docklite"
DESKTOP_PATH="$HOME/.local/share/applications/docklite.desktop"
ICON_PATH="$HOME/.local/share/icons/hicolor/scalable/apps/docklite.svg"
PORT="${DOCKLITE_APP_PORT:-9010}"
URL="http://127.0.0.1:$PORT"
PID_FILE="$DATA_DIR/docklite.pid"

[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] \
  || { printf 'ERROR: DOCKLITE_APP_PORT must be a port number 1-65535 (got: %s)\n' "$PORT" >&2; exit 1; }

# Exact versions of the native/dynamic-require deps kept external to the server
# bundle. Keep in sync with pnpm-lock.yaml when upgrading them in the repo.
ARGON2_VERSION="0.44.0"
DOCKERODE_VERSION="5.0.1"
SSH2_VERSION="1.17.0"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

installed_pid() {
  local pid
  [ -f "$PID_FILE" ] || return 1
  pid="$(cat "$PID_FILE" 2>/dev/null)" || return 1
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -qF "$APP_DIR/server.cjs" || return 1
  printf '%s' "$pid"
}

# True if anything is listening on the app port — not just a server that answers
# /api/health. Catches an unrelated listener (e.g. a dev server 404ing) that
# would otherwise pass a health-only check and then collide with EADDRINUSE.
port_listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null || return 1
  exec 3>&- 3<&-
  return 0
}

log "Building frontend (same-origin mode)"
cd "$REPO_ROOT"
VITE_API_BASE_URL="" pnpm build

log "Bundling server"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
# Run esbuild from a cwd outside $HOME: a stray Yarn PnP manifest in any
# ancestor directory (e.g. ~/.pnp.cjs) would otherwise hijack module resolution.
ESBUILD_CWD="$(mktemp -d)"
(cd "$ESBUILD_CWD" && "$REPO_ROOT/node_modules/.bin/esbuild" "$REPO_ROOT/server/src/index.ts" \
  --bundle --platform=node --format=cjs \
  --outfile="$STAGE_DIR/server.cjs" \
  --external:argon2 --external:dockerode --external:ssh2 --external:cpu-features \
  --external:bufferutil --external:utf-8-validate)
rmdir "$ESBUILD_CWD"

cp -r "$REPO_ROOT/dist" "$STAGE_DIR/dist"
git -C "$REPO_ROOT" describe --always --dirty 2>/dev/null > "$STAGE_DIR/VERSION" || date -u +%Y%m%d > "$STAGE_DIR/VERSION"

log "Installing runtime dependencies into stage"
# ponytail: direct deps are pinned exact; transitives float, guarded by
# minimumReleaseAge (24h) below. This is a single-machine personal install, so
# full cross-machine reproducibility is not a goal. Upgrade path: commit a
# dedicated runtime lockfile and add --frozen-lockfile if that ever changes.
cat > "$STAGE_DIR/package.json" <<EOF
{
  "name": "docklite-app",
  "private": true,
  "packageManager": "pnpm@11.13.0",
  "dependencies": {
    "argon2": "$ARGON2_VERSION",
    "dockerode": "$DOCKERODE_VERSION",
    "ssh2": "$SSH2_VERSION"
  }
}
EOF
cat > "$STAGE_DIR/pnpm-workspace.yaml" <<'EOF'
allowBuilds:
  argon2: true
  ssh2: true
  cpu-features: true
  protobufjs: true
minimumReleaseAge: 1440
EOF
(cd "$STAGE_DIR" && pnpm install --prod)

log "Smoke-testing the staged build"
SMOKE_DATA="$(mktemp -d)"
SMOKE_PORT=9109
trap 'if [ -f "$SMOKE_DATA/pid" ]; then kill "$(cat "$SMOKE_DATA/pid")" 2>/dev/null || true; fi; rm -rf "$SMOKE_DATA"' EXIT

(cd "$STAGE_DIR" && node -e 'require("argon2"); require("ssh2"); require("dockerode");') \
  || die "staged native dependencies failed to load"

(
  cd "$STAGE_DIR"
  DOCKLITE_ADAPTER=mock DOCKLITE_REMOTE_ENABLED=1 DOCKLITE_HOST=127.0.0.1 \
  DOCKLITE_PORT="$SMOKE_PORT" \
  DOCKLITE_AUTH_CONFIG_PATH="$SMOKE_DATA/auth-config.json" \
  DOCKLITE_ENGINE_TARGETS_PATH="$SMOKE_DATA/engine-targets.json" \
  node server.cjs > "$SMOKE_DATA/log" 2>&1 &
  echo $! > "$SMOKE_DATA/pid"
)
for _ in $(seq 1 40); do
  curl -fsm 2 "http://127.0.0.1:$SMOKE_PORT/api/health" > /dev/null 2>&1 && break
  sleep 0.5
done
curl -fsm 2 "http://127.0.0.1:$SMOKE_PORT/api/health" > /dev/null \
  || { cat "$SMOKE_DATA/log" >&2; die "staged server never became healthy"; }
curl -fsm 2 "http://127.0.0.1:$SMOKE_PORT/" | grep -q "<div id=\"root\"" \
  || die "staged server did not serve the frontend"
curl -fsm 5 -X POST "http://127.0.0.1:$SMOKE_PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' | grep -q '"token"' \
  || die "staged login (argon2) failed"
kill "$(cat "$SMOKE_DATA/pid")" 2>/dev/null || true
log "Smoke test passed"

log "Swapping in the new build"
WAS_RUNNING=0
if RUNNING_PID="$(installed_pid)"; then
  WAS_RUNNING=1
  log "Stopping running DockLite (pid $RUNNING_PID)"
  kill "$RUNNING_PID"
  for _ in $(seq 1 20); do kill -0 "$RUNNING_PID" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$RUNNING_PID" 2>/dev/null && die "old server (pid $RUNNING_PID) did not stop"
elif port_listening; then
  die "port $PORT is in use by a process this script does not manage; free it and re-run"
fi

rm -rf "$APP_DIR.old"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.old"
mv "$STAGE_DIR" "$APP_DIR"

log "Installing launcher, icon, and desktop entry"
mkdir -p "$DATA_DIR" && chmod 700 "$DATA_DIR"
mkdir -p "$(dirname "$BIN_PATH")" "$(dirname "$DESKTOP_PATH")" "$(dirname "$ICON_PATH")"

NODE_BIN="$(command -v node)" || die "node not found on PATH"

# Emit path/URL values as shell-safe tokens (printf %q) so a space or metachar
# in $HOME/$DOCKLITE_INSTALL_ROOT can't break or inject into the generated
# launcher. PORT is already validated numeric above, so it is safe to inline.
APP_DIR_Q="$(printf '%q' "$APP_DIR")"
DATA_DIR_Q="$(printf '%q' "$DATA_DIR")"
URL_Q="$(printf '%q' "$URL")"
PID_FILE_Q="$(printf '%q' "$PID_FILE")"
NODE_BIN_Q="$(printf '%q' "$NODE_BIN")"
LOCK_FILE_Q="$(printf '%q' "$DATA_DIR/.launch.lock")"

cat > "$BIN_PATH" <<EOF
#!/usr/bin/env bash
# DockLite launcher (generated by scripts/install-local.sh — do not edit by hand).
# NODE_BIN is baked in because .desktop-launched processes don't source shell
# rc files, so an nvm-managed node is not on their PATH.
set -euo pipefail
umask 077
APP_DIR=$APP_DIR_Q
DATA_DIR=$DATA_DIR_Q
PORT=$PORT
URL=$URL_Q
PID_FILE=$PID_FILE_Q
NODE_BIN=$NODE_BIN_Q
LOCK_FILE=$LOCK_FILE_Q

installed_pid() {
  local pid
  [ -f "\$PID_FILE" ] || return 1
  pid="\$(cat "\$PID_FILE" 2>/dev/null)" || return 1
  [ -n "\$pid" ] && kill -0 "\$pid" 2>/dev/null || return 1
  tr '\0' ' ' < "/proc/\$pid/cmdline" 2>/dev/null | grep -qF "\$APP_DIR/server.cjs" || return 1
  printf '%s' "\$pid"
}

port_listening() {
  (exec 3<>"/dev/tcp/127.0.0.1/\$PORT") 2>/dev/null || return 1
  exec 3>&- 3<&-
  return 0
}

ensure_running() {
  mkdir -p "\$DATA_DIR" || { echo "cannot create \$DATA_DIR" >&2; return 1; }
  chmod 700 "\$DATA_DIR" || true
  # Serialize launches so a double-click can't spawn two servers that race on
  # the pidfile. The lock lives on fd 9 of a subshell, so it is released the
  # instant the check-and-start section ends — before any exec xdg-open, which
  # would otherwise inherit the fd and hold the lock for the browser's lifetime.
  # Every critical step is checked explicitly: when this function is called as
  # 'ensure_running || ...', bash suppresses errexit for its whole body.
  (
    flock 9 || { echo "cannot acquire launch lock" >&2; exit 1; }

    installed_pid > /dev/null && exit 0
    if port_listening; then
      echo "Port \$PORT is in use by a process this launcher does not manage; refusing to start." >&2
      exit 1
    fi

    cd "\$APP_DIR" || { echo "cannot enter \$APP_DIR" >&2; exit 1; }
    # 9>&- closes the lock fd in the daemon: a long-lived server must not inherit
    # the flock, or it would hold the lock forever and deadlock later launches.
    DOCKLITE_REMOTE_ENABLED=1 DOCKLITE_HOST=127.0.0.1 DOCKLITE_PORT="\$PORT" \\
    DOCKLITE_AUTH_CONFIG_PATH="\$DATA_DIR/auth-config.json" \\
    DOCKLITE_ENGINE_TARGETS_PATH="\$DATA_DIR/engine-targets.json" \\
    nohup "\$NODE_BIN" "\$APP_DIR/server.cjs" >> "\$DATA_DIR/docklite.log" 2>&1 9>&- &
    echo \$! > "\$PID_FILE" || { echo "cannot write pidfile" >&2; exit 1; }

    for _ in \$(seq 1 40); do
      curl -fsm 2 "\$URL/api/health" > /dev/null 2>&1 && exit 0
      sleep 0.5
    done
    echo "DockLite failed to start; see \$DATA_DIR/docklite.log" >&2
    exit 1
  ) 9>"\$LOCK_FILE"
}

stop_server() {
  local pid
  if pid="\$(installed_pid)"; then
    kill "\$pid"
    for _ in \$(seq 1 20); do kill -0 "\$pid" 2>/dev/null || break; sleep 0.5; done
    if kill -0 "\$pid" 2>/dev/null; then
      echo "DockLite (pid \$pid) did not stop; leaving it managed" >&2
      return 1
    fi
    rm -f "\$PID_FILE"
    echo "DockLite stopped (pid \$pid)"
  else
    echo "DockLite is not running"
  fi
}

case "\${1:-open}" in
  stop)
    stop_server
    ;;
  start)
    ensure_running || exit 1
    ;;
  open)
    ensure_running || exit 1
    exec xdg-open "\$URL"
    ;;
  *)
    echo "usage: docklite [start|stop]" >&2
    exit 2
    ;;
esac
EOF
chmod 755 "$BIN_PATH"

cp "$REPO_ROOT/public/docklite-icon.svg" "$ICON_PATH"
chmod 644 "$ICON_PATH"

# Icon is an absolute path, not a theme name: a user-local hicolor theme has no
# icon cache/index, so a bare "Icon=docklite" name falls through to the generic
# gear. An absolute path is loaded directly and always resolves.
#
# Desktop Entry Exec quoting: double-quote so spaces (and metachars like ; & ( ))
# in $HOME stay one argument, and encode % as %% (the Exec field-code escape).
# The chars that need two-stage backslash escaping inside the quotes (\ " $ `)
# can't appear in a standard Linux home path (useradd's portable charset), so we
# reject them fail-closed rather than emit fragile multi-level escapes.
case "$BIN_PATH" in
  *\\*|*\"*|*\`*|*\$*|*[[:cntrl:]]*)
    die "launcher path contains a character unsupported in a .desktop Exec (\\ \" \` \$ or a control char): $BIN_PATH" ;;
esac
BIN_PATH_DESKTOP="${BIN_PATH//%/%%}"
# The right-click "Quit DockLite" action runs `docklite stop` — the off-switch
# for the background server once the browser tab is already closed.
cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Name=DockLite
Comment=Lightweight Docker UI
Exec="$BIN_PATH_DESKTOP"
Icon=$ICON_PATH
Terminal=false
Categories=Development;
Actions=Quit;

[Desktop Action Quit]
Name=Quit DockLite
Exec="$BIN_PATH_DESKTOP" stop
EOF
chmod 644 "$DESKTOP_PATH"

command -v update-desktop-database > /dev/null && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
command -v gtk-update-icon-cache > /dev/null && gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

if [ "$WAS_RUNNING" = 1 ]; then
  log "Restarting DockLite with the new build"
  if ! "$BIN_PATH" start; then
    log "New build failed to start — restoring previous version"
    # Reap any half-started candidate before swapping the directory back, so it
    # can't keep holding the port and defeat the restored server.
    "$BIN_PATH" stop || true
    rm -rf "$APP_DIR" && mv "$APP_DIR.old" "$APP_DIR"
    if "$BIN_PATH" start; then
      die "upgrade rolled back: new build failed, previous version restored and running (see $DATA_DIR/docklite.log)"
    fi
    die "upgrade FAILED and rollback restart also failed: previous build restored at $APP_DIR but NOT running (see $DATA_DIR/docklite.log)"
  fi
fi
rm -rf "$APP_DIR.old"

log "Installed DockLite $(cat "$APP_DIR/VERSION") to $APP_DIR"
echo "  Launch:  click the DockLite icon in your app grid, or run: docklite"
echo "  Stop:    docklite stop"
echo "  URL:     $URL"
echo "  Data:    $DATA_DIR (survives upgrades)"
echo "  Upgrade: re-run 'pnpm app:install' from the repo"
if [ ! -f "$DATA_DIR/auth-config.json" ]; then
  echo "  First login: admin / admin — change it in Settings after logging in."
fi
