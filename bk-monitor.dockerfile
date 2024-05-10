ARG COMMIT_ID=unknown

FROM node:16-alpine3.15 as js-builder

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

FROM --platform=linux/${CHIP} bitnami/grafana:9.1.0

USER root

RUN apt-get update && apt-get install -y unzip

# Remove default public directory and copy the new one
RUN rm -rf /opt/bitnami/grafana/public
COPY --from=js-builder /tmp/grafana/public /opt/bitnami/grafana/public

RUN cd /opt/bitnami/grafana/public/app/plugins/datasource/ && \
    rm -rf loki prometheus influxdb graphite mssql jaeger tempo zipkin cloudwatch cloud-monitoring grafana-azure-monitor-datasource postgres opentsdb

# Install plugins
COPY plugins /tmp/plugins
RUN unzip -o "/tmp/plugins/*.zip" -d /opt/bitnami/grafana/plugins && rm -rf /tmp/plugins

# Fix permissions
RUN chmod g+rwX /opt/bitnami/grafana/public /opt/bitnami/grafana/plugins

USER 1001

RUN echo $COMMIT_ID > /opt/bitnami/grafana/VERSION
