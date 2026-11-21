FROM node:20-alpine

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY whatsapp/package*.json ./whatsapp/

# Install all dependencies including devDependencies (needed for Vite build and tsx)
RUN npm install --include=dev --legacy-peer-deps --prefix whatsapp

# Copy whatsapp application source
COPY whatsapp ./whatsapp

WORKDIR /app/whatsapp

# Build production SPA assets so dist/index.html is created
RUN npm run build

EXPOSE 4020

# Start server using tsx
CMD ["npx", "tsx", "server.ts"]
