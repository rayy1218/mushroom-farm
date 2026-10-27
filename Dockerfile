# One image for both apps: the farm app (default) and the device app (`node device/main.js`).
# No npm packages: Node's built-in SQLite needs 22.13 or later.
FROM node:22-alpine

# The lights follow the clock, so the container runs on the farm's time zone.
ENV NODE_ENV=production TZ=Asia/Kuala_Lumpur

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY device ./device
COPY web ./web

# The database and the device state live in /data (a volume), owned by the node user.
RUN mkdir /data && chown node:node /data
USER node

EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.js"]
