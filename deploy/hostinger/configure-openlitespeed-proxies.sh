#!/usr/bin/env bash

set -euo pipefail

readonly OPENLITESPEED_ROOT="${OPENLITESPEED_ROOT:-/usr/local/lsws}"
readonly WEB_DOMAIN="${WEB_DOMAIN:-learn.stephenarthur.org}"
readonly WEB_BACKEND="${WEB_BACKEND:-127.0.0.1:13000}"
readonly H5P_DOMAIN="${H5P_DOMAIN:-h5p.stephenarthur.org}"
readonly H5P_BACKEND="${H5P_BACKEND:-127.0.0.1:18080}"
readonly CONFIG_MARKER="BEGIN LEARNERS HUB REVERSE PROXY"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

require_backend() {
  local backend="$1"
  local host="${backend%:*}"
  local port="${backend##*:}"

  if ! timeout 3 bash -c "</dev/tcp/${host}/${port}" 2>/dev/null; then
    echo "Backend ${backend} is not reachable." >&2
    exit 1
  fi
}

configure_proxy() {
  local domain="$1"
  local handler="$2"
  local backend="$3"
  local config_file="${OPENLITESPEED_ROOT}/conf/vhosts/${domain}/vhost.conf"

  if [[ ! -f "$config_file" ]]; then
    echo "Missing CyberPanel vhost configuration: ${config_file}" >&2
    exit 1
  fi
  if grep -Fq "$CONFIG_MARKER" "$config_file"; then
    verify_existing_proxy "$config_file" "$handler" "$backend"
    echo "Proxy already configured for ${domain}."
    return
  fi

  cp --archive "$config_file" "${config_file}.pre-learners-hub"
  append_proxy_config "$config_file" "$handler" "$backend"
  echo "Configured ${domain} -> ${backend}."
}

verify_existing_proxy() {
  local config_file="$1"
  local handler="$2"
  local backend="$3"

  if ! grep -Fq "extprocessor ${handler}" "$config_file" ||
    ! grep -Fq "address                 ${backend}" "$config_file"; then
    echo "Existing Learners Hub proxy block does not match ${backend}." >&2
    exit 1
  fi
}

append_proxy_config() {
  local config_file="$1"
  local handler="$2"
  local backend="$3"

  printf '\n%s\n' \
    "# ${CONFIG_MARKER}" \
    "extprocessor ${handler} {" \
    "  type                    proxy" \
    "  address                 ${backend}" \
    "  maxConns                100" \
    "  initTimeout             60" \
    "  retryTimeout            0" \
    "  respBuffer              0" \
    "}" \
    "" \
    "context / {" \
    "  type                    proxy" \
    "  handler                 ${handler}" \
    "  addDefaultCharset       off" \
    "}" \
    "# END LEARNERS HUB REVERSE PROXY" >>"$config_file"
}

validate_openlitespeed_config() {
  local validation_output

  validation_output="$("${OPENLITESPEED_ROOT}/bin/openlitespeed" -t 2>&1 || true)"
  if grep -Fq "[ERROR]" <<<"$validation_output"; then
    echo "$validation_output" >&2
    exit 1
  fi
}

gracefully_restart_openlitespeed() {
  "${OPENLITESPEED_ROOT}/bin/lswsctrl" restart
  "${OPENLITESPEED_ROOT}/bin/lswsctrl" status
}

require_root
require_backend "$WEB_BACKEND"
require_backend "$H5P_BACKEND"
configure_proxy "$WEB_DOMAIN" "learnersHubWeb" "$WEB_BACKEND"
configure_proxy "$H5P_DOMAIN" "learnersHubH5p" "$H5P_BACKEND"
validate_openlitespeed_config
gracefully_restart_openlitespeed
