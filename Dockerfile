# Playwright's official image ships Chromium plus every OS-level dependency
# it needs (fonts, libs, etc.) already installed and version-matched to the
# playwright npm package. Building on a generic node:XX image and running
# `npx playwright install` yourself is the usual source of "works locally,
# breaks in the container" Chromium failures — this avoids that class of bug.
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Builds the Node-server output (see vite.config.ts — preset: "node-server")
RUN npm run build

ENV NODE_ENV=production
ENV SCRAPER_HEADLESS=true

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]