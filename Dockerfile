FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars into the CLIENT bundle at BUILD time, not at
# container runtime. Railway's Dockerfile builder only injects service
# variables into the running container by default — NOT into the `docker
# build` step. Declaring them as ARG here (matching Railway's variable names
# exactly) makes Railway pass them in as build args, then ENV makes them
# visible to the `npm run build` step below so Vite can see them.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Builds the Node-server output (see vite.config.ts — preset: "node-server")
RUN npm run build

ENV NODE_ENV=production
ENV SCRAPER_HEADLESS=true

EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]