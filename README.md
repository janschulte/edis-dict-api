
# dict-api for edis

## Description

An api, which consumes the pegelonline api and extends the stations with additional information.

## Installation

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Docker

Build:

```bash
docker build -t dict-api .
```

Start:

```bash
docker run --rm -p 3000:3000 dict-api
```

Use and get a response:

http://localhost:3000/search?q=köln