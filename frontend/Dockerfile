FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_APP_ENV
ARG VITE_APP_BRAND_NAME
ARG VITE_APP_BRAND_SHORT_NAME
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_APP_BRAND_NAME=${VITE_APP_BRAND_NAME}
ENV VITE_APP_BRAND_SHORT_NAME=${VITE_APP_BRAND_SHORT_NAME}
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
