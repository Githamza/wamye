#!/bin/bash
# Creates the public `apk` bucket (idempotent) and uploads the current APK.
# Rerun after every APK build — the same URL then serves the new build.
set -euo pipefail
cd /Users/hamzahaddad/wamya

set -a; source .env.local; set +a

APK="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
[ -f "$APK" ] || { echo "APK introuvable: $APK"; exit 1; }

echo "— bucket (déjà là = erreur inoffensive) —"
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"apk","name":"apk","public":true}'
echo

echo "— upload $APK —"
curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/apk/wamye-livreur.apk" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "x-upsert: true" \
  --data-binary "@$APK"
echo

echo "— vérification (HTTP 200 attendu) —"
curl -s -o /dev/null -w "%{http_code} %{size_download} bytes\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/apk/wamye-livreur.apk"
