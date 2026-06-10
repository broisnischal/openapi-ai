FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY cli.ts index.ts tsconfig.json ./
COPY src ./src

# Request/auth/settings database lives here — mount a volume to persist it
VOLUME /app/data

ENV OPENAPI_AGENT_HOST=0.0.0.0
ENV OPENAPI_AGENT_PORT=3388
EXPOSE 3388

# Configure at runtime:
#   OPENAPI_AGENT_SPEC_URL  — OpenAPI spec to load on boot
#   OPENAPI_AGENT_ORIGIN    — public URL, e.g. https://api.example.com
#   OPENAPI_AGENT_TOKEN     — access token (strongly recommended)
ENTRYPOINT ["bun", "cli.ts"]
CMD ["start"]
