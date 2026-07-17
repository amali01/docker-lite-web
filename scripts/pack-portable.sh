#!/usr/bin/env bash
# Build a self-contained, repo-free DockLite bundle that can be carried to
# another Linux machine (same CPU arch, glibc >= this machine's) and installed
# with no clone, no pnpm and no build step. The target only needs Docker and a
# browser. Output: dist-portable/docklite-portable-<arch>.tar.gz
#
# On the target: extract the tarball, then run ./install-portable.sh from inside
# the extracted directory. See scripts/install-portable.sh.
set -euo pipefail
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist-portable"
BUNDLE_NAME="DockLite"
BUNDLE_DIR="$OUT_DIR/$BUNDLE_NAME"           # becomes the extracted dir on target
CACHE_DIR="$OUT_DIR/.cache"

# Node runtime to bundle. Must share the ABI major of the node that compiles the
# native deps below (this machine's node) so argon2/ssh2 load on the target.
NODE_VERSION="${DOCKLITE_BUNDLE_NODE:-v24.9.0}"

# Exact versions of the native/dynamic-require deps, kept in sync with
# scripts/install-local.sh (which is the source of truth for the local install).
ARGON2_VERSION="0.44.0"
DOCKERODE_VERSION="5.0.1"
SSH2_VERSION="1.17.0"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  NODE_ARCH="x64" ;;
  aarch64) NODE_ARCH="arm64" ;;
  *) die "unsupported architecture '$ARCH' (only x86_64 and aarch64 have prebuilt native deps here)" ;;
esac

command -v node > /dev/null || die "node not found on PATH (needed to compile native deps)"
HOST_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
BUNDLE_MAJOR="${NODE_VERSION#v}"; BUNDLE_MAJOR="${BUNDLE_MAJOR%%.*}"
[ "$HOST_MAJOR" = "$BUNDLE_MAJOR" ] || die \
  "node ABI mismatch: this machine runs node $HOST_MAJOR.x but the bundle pins $NODE_VERSION.
   Native deps compiled here would fail to load against the bundled runtime.
   Set DOCKLITE_BUNDLE_NODE to a v$HOST_MAJOR.x release, or switch your node to v$BUNDLE_MAJOR."

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR" "$CACHE_DIR"

# --- 1. frontend (same-origin) + server bundle -------------------------------
# Vite inlines every VITE_* value (and any it reads from a root .env file) into
# the public dist/. Refuse to pack if such a file exists, so a build-machine
# secret can't be baked into a public release. Treat all VITE_* as public.
for envf in .env .env.local .env.production .env.production.local; do
  [ -f "$REPO_ROOT/$envf" ] && die "refusing to pack: $REPO_ROOT/$envf exists and Vite bakes VITE_* values from it into the public bundle; move it aside first"
done
log "Building frontend"
cd "$REPO_ROOT"
VITE_API_BASE_URL="" pnpm build

log "Bundling server"
APP="$BUNDLE_DIR/app"
mkdir -p "$APP"
# Run esbuild from a cwd outside $HOME so a stray Yarn PnP manifest in an
# ancestor can't hijack module resolution (mirrors install-local.sh).
ESBUILD_CWD="$(mktemp -d)"
# --minify also strips esbuild's per-module "// <abs path>" comments, so the
# published bundle carries no build-machine username or directory layout.
(cd "$ESBUILD_CWD" && "$REPO_ROOT/node_modules/.bin/esbuild" "$REPO_ROOT/server/src/index.ts" \
  --bundle --platform=node --format=cjs --minify \
  --outfile="$APP/server.cjs" \
  --external:argon2 --external:dockerode --external:ssh2 --external:cpu-features \
  --external:bufferutil --external:utf-8-validate)
rmdir "$ESBUILD_CWD"

cp -r "$REPO_ROOT/dist" "$APP/dist"
git -C "$REPO_ROOT" describe --always --dirty 2>/dev/null > "$APP/VERSION" || date -u +%Y%m%d > "$APP/VERSION"

# --- 2. runtime (native) deps compiled against this machine's node -----------
log "Installing runtime dependencies"
cat > "$APP/package.json" <<EOF
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
cat > "$APP/pnpm-workspace.yaml" <<'EOF'
allowBuilds:
  argon2: true
  ssh2: true
  cpu-features: true
  protobufjs: true
minimumReleaseAge: 1440
EOF
(cd "$APP" && pnpm install --prod)

# Strip build intermediates and dev cruft: they embed the local build path
# (username + home dir) and are unused at runtime. Leaves only the final .node
# addons, so the published tarball reveals nothing about the build machine.
find "$APP/node_modules" -type d \( -name obj.target -o -name .deps \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$APP/node_modules" -type f \
  \( -name '*.o' -o -name '*.o.d' -o -name Makefile -o -name '*.target.mk' \
     -o -name '*.gypi' -o -name binding.Makefile \) -delete 2>/dev/null || true
find "$APP/node_modules" -type d -name .bin -exec rm -rf {} + 2>/dev/null || true
rm -f "$APP/node_modules/.modules.yaml" "$APP/node_modules/.pnpm-workspace-state-v1.json"
# Drop argon2 prebuilts for every platform except this bundle's target arch.
ARGON2_PB="$APP/node_modules/.pnpm/argon2@$ARGON2_VERSION/node_modules/argon2/prebuilds"
[ -d "$ARGON2_PB" ] && find "$ARGON2_PB" -mindepth 1 -maxdepth 1 -type d ! -name "linux-$NODE_ARCH" -exec rm -rf {} + 2>/dev/null || true
[ -d "$ARGON2_PB/linux-$NODE_ARCH" ] || die "argon2 has no prebuilt for linux-$NODE_ARCH; cannot bundle for $ARCH"

# Strip symbols, then scrub the build-machine home path from the compiled
# addons. node-gyp bakes header paths (via assert __FILE__) into .rodata, which
# strip can't remove; overwrite them in place with an equal-length neutral
# string so the published release leaks no username. Those strings are only
# referenced by assertions that never fire in normal operation.
find "$APP/node_modules" -name '*.node' -exec strip --strip-unneeded {} + 2>/dev/null || true
REAL_HOME="$HOME" python3 - "$APP" <<'PY'
import os, sys, pathlib
home = os.environ["REAL_HOME"].encode()
repl = (b"/home/" + b"x" * (len(home) - 6))[:len(home)] if len(home) > 6 else b"x" * len(home)
n = 0
for p in pathlib.Path(sys.argv[1]).rglob("*.node"):
    data = p.read_bytes()
    if home in data:
        p.write_bytes(data.replace(home, repl))
        n += 1
print(f"    scrubbed build path from {n} native addon(s)")
PY

# --- 3. bundle a Node runtime ------------------------------------------------
NODE_TARBALL="node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
NODE_CACHE="$CACHE_DIR/$NODE_TARBALL"
if [ ! -f "$NODE_CACHE" ]; then
  log "Downloading Node $NODE_VERSION ($NODE_ARCH)"
  curl -fL --retry 3 -o "$NODE_CACHE" "https://nodejs.org/dist/$NODE_VERSION/$NODE_TARBALL" \
    || die "failed to download $NODE_TARBALL"
fi
# Verify the runtime against Node's published SHASUMS256 before it can become a
# public release artifact — a compromised mirror or poisoned cache must not ship.
log "Verifying Node runtime checksum"
NODE_SUMS="$CACHE_DIR/SHASUMS256-$NODE_VERSION.txt"
curl -fL --retry 3 -o "$NODE_SUMS" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" \
  || die "failed to download SHASUMS256.txt for $NODE_VERSION"
EXPECTED="$(grep " $NODE_TARBALL\$" "$NODE_SUMS" | awk '{print $1}')"
[ -n "$EXPECTED" ] || die "no checksum listed for $NODE_TARBALL"
ACTUAL="$(sha256sum "$NODE_CACHE" | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { rm -f "$NODE_CACHE"; die "Node checksum mismatch (expected $EXPECTED, got $ACTUAL) — refusing to bundle"; }

log "Extracting Node runtime into bundle"
mkdir -p "$BUNDLE_DIR/node/bin"
# The single dynamically-linked `node` binary is all the launcher needs; it
# depends only on stock glibc/libstdc++ present on any target of this arch.
tar -xJf "$NODE_CACHE" -C "$BUNDLE_DIR/node/bin" --strip-components=2 \
  "node-$NODE_VERSION-linux-$NODE_ARCH/bin/node"

# --- 3b. enforce the advertised glibc floor ---------------------------------
# The native addons are compiled on THIS host, so a newer build machine could
# silently raise the glibc requirement. Fail the pack if anything in the load
# path needs a glibc newer than GLIBC_FLOOR, so the README's compatibility
# promise can't drift out from under a release. (objdump ships with binutils.)
GLIBC_FLOOR="2.34"
if command -v objdump > /dev/null; then
  log "Checking glibc floor (<= $GLIBC_FLOOR)"
  MAX_GLIBC="$( { find "$APP/node_modules" -name '*.node'; echo "$BUNDLE_DIR/node/bin/node"; } \
    | xargs -r objdump -T 2>/dev/null \
    | grep -oE 'GLIBC_[0-9]+\.[0-9]+(\.[0-9]+)?' | sed 's/GLIBC_//' | sort -uV | tail -1)"
  if [ -n "$MAX_GLIBC" ] && [ "$(printf '%s\n%s\n' "$GLIBC_FLOOR" "$MAX_GLIBC" | sort -V | tail -1)" != "$GLIBC_FLOOR" ]; then
    echo "  highest symbol required: GLIBC_$MAX_GLIBC" >&2
    { find "$APP/node_modules" -name '*.node'; echo "$BUNDLE_DIR/node/bin/node"; } | while read -r f; do
      v="$(objdump -T "$f" 2>/dev/null | grep -oE 'GLIBC_[0-9]+\.[0-9]+(\.[0-9]+)?' | sed 's/GLIBC_//' | sort -uV | tail -1)"
      [ -n "$v" ] && [ "$(printf '%s\n%s\n' "$GLIBC_FLOOR" "$v" | sort -V | tail -1)" != "$GLIBC_FLOOR" ] && echo "    $v  ${f#$BUNDLE_DIR/}" >&2
    done
    die "bundle requires glibc > $GLIBC_FLOOR; build on an older-glibc host/container, or raise GLIBC_FLOOR and the README floor together"
  fi
  printf '    ok: highest requirement GLIBC_%s\n' "${MAX_GLIBC:-none}"
else
  printf 'WARNING: objdump not found; skipping glibc-floor check\n' >&2
fi

# --- 4. installer + icon -----------------------------------------------------
cp "$REPO_ROOT/scripts/install-portable.sh" "$BUNDLE_DIR/install-portable.sh"
chmod 755 "$BUNDLE_DIR/install-portable.sh"
cp "$REPO_ROOT/public/docklite-icon.svg" "$BUNDLE_DIR/docklite-icon.svg"
cat > "$BUNDLE_DIR/README.txt" <<'EOF'
DockLite — portable Linux bundle
================================
Requirements on this machine: Docker installed and your user in the `docker`
group, plus a web browser. No clone, no Node, no build needed.

Install:
    ./install-portable.sh

This installs DockLite under ~/.local (no root) and adds it to your app menu.
Launch it from the menu, or run:  ~/.local/bin/docklite
Quit the background server from the menu's right-click "Quit DockLite", or:
    ~/.local/bin/docklite stop

Uninstall:  rm -rf ~/.local/share/docklite ~/.local/bin/docklite \
    ~/.local/share/applications/docklite.desktop \
    ~/.local/share/icons/hicolor/scalable/apps/docklite.svg
EOF

# --- 4b. final leak scan -----------------------------------------------------
# Last line of defence before a PUBLIC release: nothing in the assembled bundle
# may carry the build-machine home path or private-key material. Text files are
# scanned directly; the compiled .node addons (already scrubbed above) are
# re-checked as binaries to prove the scrub held.
log "Scanning bundle for leaks"
LEAK=0
if grep -rIl -e "$HOME" "$BUNDLE_DIR" 2>/dev/null | grep -q .; then
  echo "  build home path found in:" >&2
  grep -rIl -e "$HOME" "$BUNDLE_DIR" 2>/dev/null | sed "s|$BUNDLE_DIR/|    |" >&2
  LEAK=1
fi
if find "$BUNDLE_DIR" -name '*.node' -exec grep -al -e "$HOME" {} + 2>/dev/null | grep -q .; then
  echo "  build home path survived in a native addon (scrub failed)" >&2
  LEAK=1
fi
if grep -rIl -e "-----BEGIN .*PRIVATE KEY-----" "$APP/dist" "$APP/server.cjs" 2>/dev/null | grep -q .; then
  echo "  private key material found in the app bundle" >&2
  LEAK=1
fi
[ "$LEAK" = 0 ] || die "leak scan failed — refusing to package (see paths above)"
printf '    ok: no build path or key material in bundle\n'

# --- 5. tarball --------------------------------------------------------------
log "Creating tarball"
TARBALL="$OUT_DIR/docklite-portable-$ARCH.tar.gz"
tar -czf "$TARBALL" -C "$OUT_DIR" "$BUNDLE_NAME"
log "Done: $TARBALL"
du -h "$TARBALL" | cut -f1 | xargs printf '    size: %s\n'
printf '    copy it to the other laptop, extract, and run ./install-portable.sh\n'
