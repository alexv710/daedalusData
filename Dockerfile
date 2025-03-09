# Base stage with Python
FROM python:3.11-slim as python-base
WORKDIR /app

# Install minimal Python dependencies
RUN apt-get update && apt-get install -y \
    python3-opencv \
    libssl-dev \
    openssl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 install --no-cache-dir jupyter notebook

# Node.js stage with minimal dependencies
FROM node:20-alpine as dev
WORKDIR /app

# Install only the absolute essentials in the final image
RUN apk add --no-cache \
    python3 \
    libstdc++ \
    openssl

# Copy Python installations from python-base
COPY --from=python-base /usr/local /usr/local
# Make sure the SSL certs are properly set up
COPY --from=python-base /etc/ssl/certs /etc/ssl/certs

# Install pnpm with minimal footprint
RUN npm install -g pnpm && npm cache clean --force
# Set PNPM configs
RUN pnpm config set node-linker hoisted
RUN pnpm config set --global ignore-optional true

EXPOSE 3000 8888