FROM node:24.13.0 AS builder

WORKDIR /app

ENV HUSKY=0

COPY package.json package-lock.json ./

RUN npm ci

COPY src ./src
COPY public ./public
COPY astro.config.mjs tsconfig.json components.json ./

ARG PUBLIC_GOOGLE_CLIENT_ID
ENV PUBLIC_GOOGLE_CLIENT_ID=$PUBLIC_GOOGLE_CLIENT_ID

ARG PUBLIC_GOOGLE_APP_ID
ENV PUBLIC_GOOGLE_APP_ID=$PUBLIC_GOOGLE_APP_ID

RUN npm run build

FROM nginx:1.29.5

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
