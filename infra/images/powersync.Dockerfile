FROM journeyapps/powersync-service:1.29.1 AS runtime
USER root
RUN apk upgrade --no-cache
USER 901
