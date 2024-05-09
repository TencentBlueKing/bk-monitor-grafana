# syntax=docker/dockerfile:1

ARG BASE_IMAGE=alpine:3.18.3
ARG JS_IMAGE=node:20-alpine3.18
ARG JS_PLATFORM=linux/amd64
ARG GO_IMAGE=golang:1.21.5-alpine3.18

ARG GO_SRC=go-builder
ARG JS_SRC=js-builder

FROM --platform=${JS_PLATFORM} ${JS_IMAGE} as js-builder

ENV NODE_OPTIONS=--max_old_space_size=8000

WORKDIR /tmp/grafana

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
COPY packages packages
COPY plugins-bundled plugins-bundled
COPY public public

RUN yarn install --immutable

COPY tsconfig.json .eslintrc .editorconfig .browserslistrc .prettierrc.js babel.config.json ./
COPY public public
COPY scripts scripts
COPY emails emails

ENV NODE_ENV production
RUN yarn build

FROM --platform=${JS_PLATFORM} bitnami/grafana:10.3.3

USER root

RUN rm -rf /opt/bitnami/grafana/public
COPY --from=js-builder /tmp/grafana/public /opt/bitnami/grafana/public

COPY plugins /opt/bitnami/grafana/plugins

RUN chmod g+rwX /opt/bitnami/grafana/public /opt/bitnami/grafana/plugins

USER 1001
