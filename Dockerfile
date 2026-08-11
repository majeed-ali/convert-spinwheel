FROM node:20-alpine

RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=512"

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "docker-start"]
