FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

RUN mkdir -p /app/data

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]