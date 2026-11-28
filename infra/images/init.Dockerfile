FROM node:22-alpine3.23 AS runtime
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
