# syntax=docker/dockerfile:1
ARG COMMIT_ID=unknown
ARG BASE_IMAGE=alpine:3.19.1
ARG JS_IMAGE=node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
ARG CHIP=amd64
ARG GO_IMAGE=golang:1.21.8-alpine
ARG REMOVE_PLUGINS="loki prometheus influxdb graphite mssql jaeger tempo zipkin cloudwatch cloud-monitoring grafana-azure-monitor-datasource postgres opentsdb"

ARG GO_SRC=go-builder
ARG JS_SRC=js-builder

FROM --platform=linux/${CHIP} ${JS_IMAGE} as js-builder

ENV NODE_OPTIONS=--max_old_space_size=8000

WORKDIR /tmp/grafana

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages packages
COPY plugins-bundled plugins-bundled
COPY public public

RUN apk add --no-cache py3-setuptools
RUN apk add --no-cache make build-base python3
RUN yarn install --immutable --inline-builds

COPY tsconfig.json .eslintrc .editorconfig .browserslistrc .prettierrc.js ./
COPY public public
COPY scripts scripts
COPY emails emails

ENV NODE_ENV production
RUN yarn build

COPY plugins /tmp/grafana-extra-plugins
RUN set -e; for archive in /tmp/grafana-extra-plugins/*.zip; do \
    unzip -o "$archive" -d /tmp/grafana-extra-plugins; \
    rm "$archive"; \
    done

FROM --platform=linux/${CHIP} bitnamilegacy/grafana:10.4.10@sha256:8d359d6d2684dd3aee0d1d3104fb51c93ae3905356e299d8f2864c84983bebbf

ARG CHIP
ARG COMMIT_ID

USER root

RUN set -eu; case "$CHIP" in \
    amd64) brotli_sha256=e27b3d655fa6fadd7a56f706687e94573c0af68b7d6df394a32a381a3a6c6d8b ;; \
    arm64) brotli_sha256=131e62b9708da9aea88be990d275cb5c7b119e40beccf174c23ac8dc7246bb0f ;; \
    *) echo "Unsupported architecture: $CHIP" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://security.debian.org/debian-security/pool/updates/main/b/brotli/libbrotli1_1.0.9-2+deb12u1_${CHIP}.deb" -o /tmp/libbrotli1.deb \
    && printf '%s  %s\n' "$brotli_sha256" /tmp/libbrotli1.deb | sha256sum -c - \
    && dpkg -i /tmp/libbrotli1.deb \
    && rm /tmp/libbrotli1.deb

# Remove default public directory and copy the new one
RUN rm -rf /opt/bitnami/grafana/public
COPY --from=js-builder /tmp/grafana/public /opt/bitnami/grafana/public

ENV REMOVE_PLUGINS=${REMOVE_PLUGINS}
RUN cd /opt/bitnami/grafana/public/app/plugins/datasource/ && \
    echo ${REMOVE_PLUGINS} | tr ' ' '\n' | xargs -I {} rm -rf {}

# Install plugins
COPY --from=js-builder /tmp/grafana-extra-plugins /opt/bitnami/grafana/plugins
COPY scripts/verify-runtime-image.sh /opt/bitnami/scripts/grafana/verify-runtime-image.sh

# Fix permissions
RUN chmod g+rwX /opt/bitnami/grafana/public /opt/bitnami/grafana/plugins

ENV COMMIT_ID=${COMMIT_ID}
RUN echo $COMMIT_ID > /opt/bitnami/grafana/VERSION

USER 1001
RUN sh /opt/bitnami/scripts/grafana/verify-runtime-image.sh 10.4.10 1.0.9-2+deb12u1 grafana-clock-panel
