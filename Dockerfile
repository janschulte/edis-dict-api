FROM node:18-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . /src
WORKDIR /src

RUN pnpm install
RUN pnpm run build

FROM base
EXPOSE 3000
CMD [ "pnpm", "start" ]