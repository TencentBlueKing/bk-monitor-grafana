# syntax=docker/dockerfile:1

ARG BASE_IMAGE=alpine:3.19.1
ARG JS_IMAGE=node:20-alpine
ARG CHIP=amd64
ARG GO_IMAGE=golang:1.21.8-alpine

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

RUN apk add --no-cache make build-base python3

RUN yarn install --immutable

COPY tsconfig.json .eslintrc .editorconfig .browserslistrc .prettierrc.js ./
COPY public public
COPY scripts scripts
COPY emails emails

ENV NODE_ENV production
RUN yarn build

FROM --platform=linux/${CHIP} bitnami/grafana:10.4.2

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
