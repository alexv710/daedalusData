FROM node:23-slim as dev
WORKDIR /app

# Install pnpm with minimal cache
RUN npm install -g pnpm && npm cache clean --force

# Install minimal Python and dependencies
RUN apt-get update && apt-get install -y \
    python3-minimal \
    python3-pip \
    python3-venv \
    python3-opencv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
RUN pip3 install --no-cache-dir jupyter notebook

# Set PNPM configs
RUN pnpm config set node-linker hoisted
RUN pnpm config set --global ignore-optional true

EXPOSE 3000 8888