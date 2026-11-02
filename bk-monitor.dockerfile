ARG CHIP=amd64
ARG COMMIT_ID=unknown
ARG REMOVE_PLUGINS="loki prometheus influxdb graphite mssql jaeger tempo zipkin cloudwatch cloud-monitoring grafana-azure-monitor-datasource postgres opentsdb"

FROM --platform=linux/${CHIP} node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 as js-builder

ENV NODE_OPTIONS=--max_old_space_size=8000

WORKDIR /grafana

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages packages
COPY plugins-bundled plugins-bundled

RUN yarn install

COPY tsconfig.json .eslintrc .editorconfig .browserslistrc .prettierrc.js babel.config.json .linguirc ./
COPY public public
COPY tools tools
COPY scripts scripts
COPY emails emails

ENV NODE_ENV production
RUN yarn build

# Unpack plugins in the builder so the runtime needs no additional APT packages.
COPY plugins /tmp/grafana-plugins
RUN for archive in /tmp/grafana-plugins/*.zip; do \
      [ -f "$archive" ] || continue; \
      unzip -oq "$archive" -d /tmp/grafana-plugins && rm "$archive" || exit 1; \
    done

FROM --platform=linux/${CHIP} bitnamilegacy/grafana:9.1.0@sha256:ab1f3cf5d08d39ef027d683513b74d9c678554bb80cfbc42a7717bdb40752ab7

ARG COMMIT_ID=unknown
ARG CHIP

USER root

# Debian's security backport retains the existing libbrotli ABI.
RUN case "${CHIP}" in \
      amd64) brotli_sha256=9e3ee4ada11c1c78902289ea2ef2b56f54b38142009d68a52bc4e57d9e9dc3ce ;; \
      arm64) brotli_sha256=5a16c7047f086e7071a324ba33f22c30a9ecab3712c7f8d23d6a6ea67380844e ;; \
      *) echo "Unsupported architecture: ${CHIP}" >&2; exit 1 ;; \
    esac && \
    curl --fail --show-error --location --retry 3 \
      "https://deb.freexian.com/extended-lts/pool/main/b/brotli/libbrotli1_1.0.9-2+deb11u1_${CHIP}.deb" \
      --output /tmp/libbrotli1.deb && \
    echo "${brotli_sha256}  /tmp/libbrotli1.deb" | sha256sum --check --strict && \
    dpkg --install /tmp/libbrotli1.deb && \
    rm /tmp/libbrotli1.deb

# Remove default public directory and copy the new one
RUN rm -rf /opt/bitnami/grafana/public
COPY --from=js-builder /grafana/public /opt/bitnami/grafana/public

ENV REMOVE_PLUGINS=${REMOVE_PLUGINS}
RUN cd /opt/bitnami/grafana/public/app/plugins/datasource/ && \
    echo ${REMOVE_PLUGINS} | tr ' ' '\n' | xargs -I {} rm -rf {}

# Install plugins
COPY --from=js-builder /tmp/grafana-plugins /opt/bitnami/grafana/plugins
COPY scripts/verify-runtime-image.sh /opt/bitnami/scripts/grafana/verify-runtime-image.sh

# Fix permissions
RUN chmod g+rwX /opt/bitnami/grafana/public /opt/bitnami/grafana/plugins

ENV COMMIT_ID=${COMMIT_ID}
RUN echo $COMMIT_ID > /opt/bitnami/grafana/VERSION

USER 1001
RUN sh /opt/bitnami/scripts/grafana/verify-runtime-image.sh 9.1.0 1.0.9-2+deb11u1 grafana-clock-panel
