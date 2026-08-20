#!/bin/bash
echo "Starting first-time setup for Store Assets Generator..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js (v20+) and try again."
    exit 1
fi

# Install dependencies
echo "Installing npm packages..."
npm install

# Install Playwright Chromium browser
echo "Installing Playwright Chromium browser..."
npx playwright install chromium

# Build project
echo "Compiling TypeScript project..."
npm run build

# Install Agent Skills & configure MCP
echo "Installing agent skills..."
node dist/cli/index.js install

echo "Setup complete! You can now start the project using ./start.sh"
