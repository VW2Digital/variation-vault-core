#!/bin/bash
set -e

echo "Installing all project dependencies..."
cd /vercel/share/v0-project

npm ci --verbose

echo "Dependencies installed successfully!"
