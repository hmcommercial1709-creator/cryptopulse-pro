FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web ./apps/web

EXPOSE 8080
CMD ["npm", "start"]
