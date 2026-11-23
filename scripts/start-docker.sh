#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
root="$PWD"
requested_host="${1:-}"
release=docker-v1
bundle="$root/dist/$release"
url="https://github.com/scarlettnik/fault-view/releases/download/$release"

if [[ $(uname -m) != x86_64 ]]; then
  echo 'Этот Docker-комплект рассчитан на x86-64.' >&2
  exit 1
fi
docker compose version >/dev/null

if [[ ! -f "$bundle/VERSION" ]]; then
  mkdir -p "$root/dist"
  temporary=$(mktemp -d "$root/dist/.docker-download.XXXXXX")
  trap 'rm -rf -- "$temporary"' EXIT
  curl --fail --show-error --silent --location --proto '=https' --retry 2 \
    "$url/faultview-linux-amd64.tar.gz" -o "$temporary/faultview-linux-amd64.tar.gz"
  curl --fail --show-error --silent --location --proto '=https' --retry 2 \
    "$url/faultview-linux-amd64.tar.gz.sha256" -o "$temporary/faultview-linux-amd64.tar.gz.sha256"
  (cd "$temporary" && sha256sum --check faultview-linux-amd64.tar.gz.sha256)
  mkdir "$temporary/bundle"
  tar -xzf "$temporary/faultview-linux-amd64.tar.gz" --strip-components=1 -C "$temporary/bundle"
  mv -T "$temporary/bundle" "$bundle"
fi

read -r revision < "$bundle/VERSION"
tag="${revision:0:12}"
app_image="faultview/app:$tag"
if ! docker image inspect "$app_image" "faultview/demo:$tag" "faultview/proxy:$tag" \
  "faultview/postgres:$tag" "faultview/object-store:$tag" >/dev/null 2>&1; then
  docker load -i "$bundle/images.tar"
fi

if [[ ! -f .env ]]; then
  docker run --rm --network none --pull never --user "$(id -u):$(id -g)" \
    -v "$root:/project" -w /project --entrypoint node "$app_image" \
    scripts/prepare-vps-env.mjs "${requested_host:-localhost}"
fi

compose=(docker compose --env-file "$root/.env" -f "$bundle/compose.json")
host=$("${compose[@]}" config --environment | sed -n 's/^FAULTVIEW_PUBLIC_HOST=//p')
if [[ -n $requested_host && ${requested_host,,} != "$host" ]]; then
  echo 'Указанный домен отличается от FAULTVIEW_PUBLIC_HOST в .env. Обновите это поле и повторите запуск.' >&2
  exit 1
fi
if [[ $host == localhost ]]; then
  compose+=(-p faultview-local -f "$root/deploy/compose.local.yaml")
else
  compose+=(-p faultview)
fi
"${compose[@]}" up --no-build --pull never --wait
