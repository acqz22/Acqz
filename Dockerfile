FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN ls -la   # ← This will print all files in the build logs (for debugging)
EXPOSE 10000
CMD ["npm", "start"]
