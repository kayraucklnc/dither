# Dither.
#
# Chromium is the awkward part: the render pipeline screenshots a real page, so
# the image needs a browser and the fonts a panel is designed against. Playwright
# publishes an image with both already installed and matched to its own version,
# which beats assembling one and discovering the mismatch at render time.
# Tag must match the playwright version in web/package.json: the image ships
# browsers under a version-stamped path, and a mismatch fails at render time
# with "Executable doesn't exist" rather than at build.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base
WORKDIR /app

# The image ships npm 10, which cannot read the optional platform entries npm 11
# writes into a lockfile - it reports them as missing and refuses to `ci`.
# Matching the version that wrote the lockfile is cheaper than loosening the
# install into something unreproducible.
RUN npm install -g npm@11

FROM base AS deps
COPY web/package.json web/package-lock.json ./
# `npm install` rather than `npm ci`: a lockfile written on macOS omits the
# linux-only optional binaries sharp and esbuild need, and one written on linux
# omits the macOS ones, so `ci` fails on whichever platform did not write it.
# Versions still come from the lockfile; only the platform binaries resolve here.
RUN npm install --no-audit --no-fund

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
# Extensions are read at request time rather than bundled, but the build wants
# the directory to exist.
COPY extensions/ ../extensions/
RUN npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/src/lib/render ./src/lib/render

# The renderer reads its stylesheet and the mark off disk relative to the
# working directory, so both have to be here rather than only in the bundle.
RUN mkdir -p /data/renders

EXPOSE 3000
CMD ["npm", "run", "start"]
