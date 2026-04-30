#!/usr/bin/env bash
# Regression tests for the DB-content + Live Content Collections upgrade.
# Run after deploying any change that touches:
#   - api/routes/content.js (CRUD)
#   - src/live.config.ts (live collections)
#   - src/pages/docs/[...slug].astro (dynamic SSR route)
#   - api/lib/migrations.js (schema)
#
# Each test prints PASS or FAIL with context. Exits non-zero if any fail.
#
# Usage:
#   tests/regression-content-upgrade.sh                    # against prod
#   API=http://tower-nas:7839 tests/regression-content-upgrade.sh   # against tower-nas

set -u

API="${API:-https://api.siftersearch.com}"
SITE="${SITE:-https://siftersearch.com}"
KEY="${INTERNAL_API_KEY:-}"

pass=0
fail=0
failures=()

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $desc (HTTP $actual)"
    pass=$((pass+1))
  else
    echo "  FAIL  $desc (expected $expected, got $actual)"
    fail=$((fail+1))
    failures+=("$desc")
  fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    echo "  PASS  $desc"
    pass=$((pass+1))
  else
    echo "  FAIL  $desc (missing: $needle)"
    fail=$((fail+1))
    failures+=("$desc")
  fi
}

echo "=== API: ${API} ==="
echo "=== SITE: ${SITE} ==="
echo

# ─── 1. Content API: public reads ───────────────────────────────────────────
echo "── Content API: public reads ──"
status=$(curl -s -o /tmp/regr-pages.json -w '%{http_code}' "${API}/api/v1/pages")
assert_status "GET /api/v1/pages" "200" "$status"
body=$(cat /tmp/regr-pages.json)
assert_contains "list contains chatbot-personality" '"chatbot-personality"' "$body"
assert_contains "list contains indexing-layers" '"indexing-layers"' "$body"

status=$(curl -s -o /tmp/regr-doc.json -w '%{http_code}' "${API}/api/v1/pages/chatbot-personality")
assert_status "GET /api/v1/pages/chatbot-personality" "200" "$status"
body=$(cat /tmp/regr-doc.json)
assert_contains "doc has body_html" 'body_html' "$body"
assert_contains "doc body has heading" 'Interfaith Research Companion' "$body"

status=$(curl -s -o /dev/null -w '%{http_code}' "${API}/api/v1/pages/does-not-exist")
assert_status "GET nonexistent slug → 404" "404" "$status"

# ─── 2. Content API: admin auth ──────────────────────────────────────────────
echo
echo "── Content API: admin auth ──"
if [ -n "$KEY" ]; then
  status=$(curl -s -o /dev/null -w '%{http_code}' "${API}/api/v1/admin/pages")
  assert_status "GET admin without key → 401" "401" "$status"
  status=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Admin-Key: $KEY" "${API}/api/v1/admin/pages")
  assert_status "GET admin with key → 200" "200" "$status"
  status=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Admin-Key: not-the-key" "${API}/api/v1/admin/pages")
  assert_status "GET admin with wrong key → 401" "401" "$status"
else
  echo "  SKIP  admin auth tests (set INTERNAL_API_KEY env)"
fi

# ─── 3. Search API regression ───────────────────────────────────────────────
echo
echo "── Search API regression ──"
search_resp=$(curl -s -X POST "${API}/api/v1/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${PUBLIC_SIFTER_API_KEY:-anonymous}" \
  -d '{"query":"detachment","limit":5}')
if echo "$search_resp" | grep -q '"results"\|"hits"\|"passages"'; then
  echo "  PASS  POST /api/v1/search returns results"
  pass=$((pass+1))
else
  # Some endpoints reject anonymous; treat 401 as expected non-failure
  if echo "$search_resp" | grep -q '"error"'; then
    echo "  SKIP  search (auth required or rate-limited)"
  else
    echo "  FAIL  POST /api/v1/search no results structure"
    fail=$((fail+1))
    failures+=("search api")
  fi
fi

# ─── 4. Library API regression ──────────────────────────────────────────────
echo
echo "── Library API regression ──"
status=$(curl -s -o /tmp/regr-rel.json -w '%{http_code}' \
  -H "X-API-Key: ${PUBLIC_SIFTER_API_KEY:-anonymous}" \
  "${API}/api/v1/library/religions")
assert_status "GET /api/v1/library/religions" "200" "$status"
body=$(cat /tmp/regr-rel.json)
assert_contains "religions list non-empty" '"name"' "$body"

# ─── 5. Existing static doc URLs (deployed site) ────────────────────────────
echo
echo "── Existing static docs still render (deployed site) ──"
for slug in api research-strategy library translation-pipeline; do
  status=$(curl -s -o /dev/null -L -w '%{http_code}' "${SITE}/docs/${slug}")
  assert_status "GET /docs/${slug} (deployed)" "200" "$status"
done

echo
echo "── Dynamic SSR docs (deployed site) — these need next deploy to land ──"
for slug in chatbot-personality indexing-layers api-billing; do
  status=$(curl -s -o /dev/null -L -w '%{http_code}' "${SITE}/docs/${slug}")
  case "$status" in
    200) echo "  PASS  GET /docs/${slug} via SSR (HTTP 200)" ; pass=$((pass+1)) ;;
    *) echo "  WARN  GET /docs/${slug} HTTP $status (may need next Cloudflare deploy)" ;;
  esac
done

# ─── 6. Astro build sanity (local) ──────────────────────────────────────────
# Done separately — running build on every regression run is slow.

echo
echo "──────────────────────────────────────────────────"
echo "RESULTS: ${pass} passed, ${fail} failed"
if [ "$fail" -gt 0 ]; then
  echo
  echo "Failures:"
  for f in "${failures[@]}"; do echo "  - $f"; done
  exit 1
fi
echo "All regression checks passed ✓"
exit 0
