FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV HOST=0.0.0.0 PORT=8787 CACHE_DIR=/tmp/f1-cache
EXPOSE 8787
CMD ["npm", "start"]
