#!/bin/sh
# Verify the final Linux image as its runtime user during docker build.
set -eu

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <grafana-version> <libbrotli1-version> <plugin-id>" >&2
    exit 2
fi
expected_server=$1
expected_brotli=$2
expected_plugins=$3
grafana_home=/opt/bitnami/grafana

[ "$(id -u)" = 1001 ]
[ "$(dpkg-query -W -f='${Version}' libbrotli1)" = "$expected_brotli" ]
curl --version
"$grafana_home/bin/grafana-server" -v | grep -F "Version $expected_server ("

work=$(mktemp -d)
server_pid=
cleanup() {
    status=$?
    if [ -n "$server_pid" ]; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    if [ "$status" -ne 0 ] && [ -f "$work/server.log" ]; then
        cat "$work/server.log" >&2
    fi
    rm -rf "$work"
    exit "$status"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM

for component in common dec enc; do
    library=$(dpkg-query -L libbrotli1 | grep "/libbrotli${component}\.so\.1$")
    ldd "$library" > "$work/ldd.txt"
    cat "$work/ldd.txt"
    if grep -F 'not found' "$work/ldd.txt"; then
        exit 1
    fi
done

# CI injects these plugins before building the image; read their actual IDs.
for manifest in "$grafana_home"/plugins/bkmonitor-*/plugin.json "$grafana_home"/plugins/bklog-*/plugin.json; do
    [ -f "$manifest" ] || continue
    plugin_id=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest")
    case "$plugin_id" in
        ''|*[!a-zA-Z0-9._-]*) echo "Invalid plugin ID in $manifest" >&2; exit 1 ;;
    esac
    expected_plugins="$expected_plugins $plugin_id"
done
unsigned_plugins=$(printf '%s' "$expected_plugins" | tr ' ' ',')
mkdir -p "$work/data" "$work/logs" "$work/provisioning"
GF_PATHS_DATA="$work/data" GF_PATHS_LOGS="$work/logs" \
    GF_PATHS_PLUGINS="$grafana_home/plugins" GF_PATHS_PROVISIONING="$work/provisioning" \
    GF_SERVER_HTTP_ADDR=127.0.0.1 GF_SERVER_HTTP_PORT=33000 \
    GF_DATABASE_TYPE=sqlite3 GF_DATABASE_PATH="$work/data/grafana.db" \
    GF_SECURITY_ADMIN_USER=image-check GF_SECURITY_ADMIN_PASSWORD=image-check-only \
    GF_AUTH_BASIC_ENABLED=true GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_ANALYTICS_REPORTING_ENABLED=false GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false GF_LOG_MODE=console \
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS="$unsigned_plugins" \
    "$grafana_home/bin/grafana-server" --homepath="$grafana_home" --config=/dev/null \
    > "$work/server.log" 2>&1 &
server_pid=$!
url=http://127.0.0.1:33000
attempt=0
until curl --noproxy '*' -fsS --connect-timeout 1 --max-time 5 "$url/api/health" > "$work/health.json" 2>/dev/null; do
    attempt=$((attempt + 1))
    if ! kill -0 "$server_pid" 2>/dev/null || [ "$attempt" -ge 60 ]; then
        echo 'Grafana did not become healthy' >&2
        exit 1
    fi
    sleep 1
done
tr -d '[:space:]' < "$work/health.json" | grep -F "\"version\":\"$expected_server\""
grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' "$work/health.json"

for extension in js css; do
    asset=$(find "$grafana_home/public/build" -maxdepth 1 -type f -name "*.$extension" -print -quit)
    [ -n "$asset" ]
    curl --noproxy '*' -fsS --max-time 10 "$url/public/build/$(basename "$asset")" > "$work/asset"
    cmp "$asset" "$work/asset"
done
curl --noproxy '*' -fsS --max-time 10 --user image-check:image-check-only "$url/api/plugins" > "$work/plugins.json"
plugins=$(tr -d '[:space:]' < "$work/plugins.json")
for plugin_id in $expected_plugins; do
    printf '%s' "$plugins" | grep -F "\"id\":\"$plugin_id\"" > /dev/null
done
echo "Grafana $expected_server, libbrotli1 $expected_brotli, static assets and plugins verified as UID 1001"
