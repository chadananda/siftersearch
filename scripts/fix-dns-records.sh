#!/bin/bash
# Fix DNS records for siftersearch.com Pages deployment
# Requires API token with Zone:DNS:Edit permission

source .env-secrets

ZONE_ID="$CLOUDFLARE_ZONE_ID"
API_TOKEN="$CLOUDFLARE_API_TOKEN"

echo "=== Listing current DNS records ==="
RECORDS=$(curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json")

echo "$RECORDS" | jq '.result[] | {id, type, name, content}'

echo ""
echo "=== Looking for A records to delete ==="

# Find A record IDs for root and www
ROOT_A_IDS=$(echo "$RECORDS" | jq -r '.result[] | select(.type=="A" and .name=="siftersearch.com") | .id')
WWW_A_IDS=$(echo "$RECORDS" | jq -r '.result[] | select(.type=="A" and .name=="www.siftersearch.com") | .id')

# Delete A records for root domain
for ID in $ROOT_A_IDS; do
  echo "Deleting A record $ID for siftersearch.com..."
  curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${ID}" \
    -H "Authorization: Bearer ${API_TOKEN}" | jq '.success'
done

# Delete A records for www
for ID in $WWW_A_IDS; do
  echo "Deleting A record $ID for www.siftersearch.com..."
  curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${ID}" \
    -H "Authorization: Bearer ${API_TOKEN}" | jq '.success'
done

echo ""
echo "=== Creating CNAME records for Pages ==="

# Create CNAME for root domain
echo "Creating CNAME for siftersearch.com -> siftersearch.pages.dev..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "@",
    "content": "siftersearch.pages.dev",
    "ttl": 1,
    "proxied": true
  }' | jq '{success, errors}'

# Create CNAME for www
echo "Creating CNAME for www.siftersearch.com -> siftersearch.pages.dev..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "www",
    "content": "siftersearch.pages.dev",
    "ttl": 1,
    "proxied": true
  }' | jq '{success, errors}'

echo ""
echo "=== Done! Verify DNS records ==="
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${API_TOKEN}" | jq '.result[] | select(.name | test("siftersearch.com")) | {type, name, content}'
