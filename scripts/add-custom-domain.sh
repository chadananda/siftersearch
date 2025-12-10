#!/bin/bash
# Add custom domain to Cloudflare Pages

source .env-secrets

ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
API_TOKEN="$CLOUDFLARE_API_TOKEN"
PROJECT_NAME="siftersearch"

echo "Adding siftersearch.com to Pages project..."
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/domains" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"name":"siftersearch.com"}' | jq .

echo ""
echo "Adding www.siftersearch.com to Pages project..."
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/domains" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"name":"www.siftersearch.com"}' | jq .
