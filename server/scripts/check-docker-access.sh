#!/usr/bin/env bash
set -euo pipefail

socket_path="${DOCKLITE_DOCKER_SOCKET:-/var/run/docker.sock}"

echo "Checking Docker CLI..."
command -v docker >/dev/null 2>&1 || {
  echo "docker command not found"
  exit 1
}

echo "Checking Docker socket at ${socket_path}..."
if [ ! -S "${socket_path}" ]; then
  echo "Docker socket not found: ${socket_path}"
  exit 1
fi

echo "Checking Docker daemon connectivity..."
if ! docker info >/dev/null 2>&1; then
  echo "Cannot talk to Docker daemon."
  echo "If this is a permissions issue, add your user to the docker group and re-login."
  exit 1
fi

echo "Docker access check passed."
