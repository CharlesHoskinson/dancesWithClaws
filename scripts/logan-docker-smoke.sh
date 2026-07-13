#!/usr/bin/env bash
# Logan hardened sandbox + proxy smoke test (run from WSL/Linux with Docker).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SANDBOX_IMAGE="${OPENCLAW_SANDBOX_IMAGE:-openclaw-sandbox:bookworm-slim}"
PROXY_IMAGE="${OPENCLAW_PROXY_IMAGE:-openclaw-proxy}"
PROXY_NAME="${OPENCLAW_PROXY_NAME:-openclaw-proxy-smoke}"
NETWORK="${OPENCLAW_SANDBOX_NETWORK:-oc-sandbox-net}"
PROXY_IP="${OPENCLAW_PROXY_IP:-172.30.0.10}"

echo "=== repo: $ROOT_DIR ==="
echo "=== build sandbox ($SANDBOX_IMAGE) ==="
docker build -t "$SANDBOX_IMAGE" -f Dockerfile.sandbox .

echo "=== build proxy ($PROXY_IMAGE) ==="
docker build -t "$PROXY_IMAGE" -f Dockerfile.proxy .

echo "=== ensure network $NETWORK ==="
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create --subnet=172.30.0.0/24 "$NETWORK"
fi

echo "=== start proxy $PROXY_NAME @ $PROXY_IP ==="
docker rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
docker run -d --name "$PROXY_NAME" \
  --network "$NETWORK" --ip "$PROXY_IP" \
  --cap-add NET_ADMIN --cap-add SETUID --cap-add SETGID --cap-drop ALL \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /var/spool/squid:size=64m \
  --tmpfs /var/log/squid:size=16m \
  --tmpfs /run:size=8m \
  "$PROXY_IMAGE"

cleanup() {
  docker rm -f "$PROXY_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if docker exec "$PROXY_NAME" true >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
sleep 2
docker ps --filter "name=$PROXY_NAME" --format "{{.Names}} {{.Status}}"

run_sbx() {
  docker run --rm \
    --network "$NETWORK" \
    --add-host "proxy:${PROXY_IP}" \
    --dns "$PROXY_IP" \
    "$SANDBOX_IMAGE" \
    bash -lc "$*"
}

echo "=== sandbox identity ==="
run_sbx 'whoami; id; command -v curl; curl --version | head -1'

echo "=== allowlist: https://api.openai.com (expect 2xx/3xx/4xx from origin, not proxy-deny) ==="
# OpenAI origin often returns 401/404 without a key; that still proves CONNECT was allowed.
ALLOW_CODE="$(run_sbx 'curl -sS -o /dev/null -w "%{http_code}" --max-time 25 https://api.openai.com' || true)"
if [[ -z "$ALLOW_CODE" || "$ALLOW_CODE" == "000" ]]; then
  ALLOW_CODE="$(run_sbx "curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -x http://${PROXY_IP}:3128 https://api.openai.com" || true)"
fi
echo "allowlisted host HTTP $ALLOW_CODE"

echo "=== deny: https://evil.com (expect 403 CONNECT deny) ==="
EVIL_OUT="$(run_sbx 'curl -sS -o /dev/null -w "%{http_code}" --max-time 15 https://evil.com' 2>&1 || true)"
EVIL_CODE="$(printf '%s' "$EVIL_OUT" | tr -cd '0-9' | tail -c 3)"
echo "evil.com raw: $EVIL_OUT"
echo "evil.com HTTP ${EVIL_CODE:-FAIL}"

ok=1
case "$ALLOW_CODE" in
  200|201|204|301|302|307|308|401|403|404) echo "PASS: allowlisted host reached via proxy ($ALLOW_CODE)" ;;
  *)
    echo "FAIL: allowlisted host should pass CONNECT (got '$ALLOW_CODE')"
    ok=0
    ;;
esac

if [[ "$EVIL_CODE" == "200" ]]; then
  echo "FAIL: evil.com should not return 200 through proxy"
  ok=0
elif [[ "$EVIL_CODE" == "403" || "$EVIL_OUT" == *"403"* || "$EVIL_CODE" == "000" || -z "$EVIL_CODE" ]]; then
  echo "PASS: evil.com blocked as expected"
else
  echo "WARN: unexpected evil.com result ($EVIL_OUT)"
fi

if [[ "$ok" -eq 1 ]]; then
  echo "SMOKE_OK"
  exit 0
fi
echo "SMOKE_FAIL"
exit 1
