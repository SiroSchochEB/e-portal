FROM node:22-alpine

WORKDIR /app

COPY server.js .
COPY accounts.json .

EXPOSE 3000

CMD ["node", "server.js"]