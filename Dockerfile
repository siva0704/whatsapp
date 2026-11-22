FROM node:20-alpine

WORKDIR /app

# Copy all files
COPY . .

# Handle both standalone repo (files at /app root) and monorepo (files inside /app/whatsapp)
RUN if [ -f ./whatsapp/package.json ]; then \
      cd whatsapp && npm install --include=dev --legacy-peer-deps && npm run build; \
    else \
      npm install --include=dev --legacy-peer-deps && npm run build; \
    fi

EXPOSE 4020

# Start server using tsx
CMD ["sh", "-c", "if [ -f ./whatsapp/server.ts ]; then cd whatsapp && npx tsx server.ts; else npx tsx server.ts; fi"]
