#!/bin/bash
# Tower S3 gateway (versitygw, posix backend): /tank/sifter/s3/<bucket> → S3 on 127.0.0.1:7070, exposed to the image
# Worker as s3.siftersearch.com through the tunnel (every request SigV4-signed). Buckets are directories or symlinked
# directories (--bucketlinks): covers → /tank/sifter/covers. Keys from .env-secrets (S3_ACCESS_KEY / S3_SECRET_KEY).
set -e
cd "$(dirname "$0")/.."
export ROOT_ACCESS_KEY=$(grep '^S3_ACCESS_KEY=' .env-secrets | cut -d= -f2-)
export ROOT_SECRET_KEY=$(grep '^S3_SECRET_KEY=' .env-secrets | cut -d= -f2-)
[ -n "$ROOT_ACCESS_KEY" ] && [ -n "$ROOT_SECRET_KEY" ] || { echo "S3 keys missing from .env-secrets"; exit 1; }
exec "$HOME/opt/versitygw/versitygw" --port 127.0.0.1:7070 posix --bucketlinks /tank/sifter/s3
