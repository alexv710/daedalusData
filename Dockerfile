FROM node:20-slim as dev
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install Python and other dependencies, including build essentials for native modules
RUN apt-get update && apt-get install -y \
    python3-full \
    python3-pip \
    python3-opencv \
    sqlite3 \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install -r requirements.txt
RUN pip3 install jupyter notebook

# Set PNPM to ignore optional dependencies and use node-linker=hoisted
RUN pnpm config set node-linker hoisted
RUN pnpm config set --global ignore-optional true

EXPOSE 3000 8888
