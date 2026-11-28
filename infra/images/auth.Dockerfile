FROM golang:1.27-alpine3.23 AS build
ENV CGO_ENABLED=0
ARG GOTRUE_VERSION=2.199.0
ARG GOTRUE_COMMIT=0725a1d90cd9fbbb2a26f3baf18afd400a436f66
RUN apk add --no-cache git make
WORKDIR /src
RUN git -c advice.detachedHead=false clone -q --depth 1 --branch "v$GOTRUE_VERSION" https://github.com/supabase/auth.git . \
    && test "$(git rev-parse HEAD)" = "$GOTRUE_COMMIT"
RUN go get golang.org/x/net@v0.62.0 github.com/go-jose/go-jose/v4@v4.1.6 && go mod tidy
RUN RELEASE_VERSION="$GOTRUE_VERSION" make auth

FROM alpine:3.23 AS runtime
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates \
    && adduser -D -u 1000 supabase
COPY --from=build /src/auth /usr/local/bin/auth
COPY --from=build /src/migrations /usr/local/etc/auth/migrations/
ENV GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations
USER supabase
CMD ["auth"]
