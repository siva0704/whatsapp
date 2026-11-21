FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY whatsapp/package*.json ./whatsapp/

RUN npm install --legacy-peer-deps --prefix whatsapp

COPY whatsapp ./whatsapp

WORKDIR /app/whatsapp

EXPOSE 4020

CMD ["npm", "run", "dev"]
