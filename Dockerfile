FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "server/server.js"]
