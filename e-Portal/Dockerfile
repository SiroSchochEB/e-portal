FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY server.js .
COPY index.html .

RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "server.js"]
