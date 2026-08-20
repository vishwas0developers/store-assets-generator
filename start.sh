#!/bin/bash
echo "Starting Store Assets Generator..."

# Check if build exists, if not build it
if [ ! -d "dist" ]; then
    echo "Compiling TypeScript project..."
    npm run build
fi

# Run the CLI help command by default or start MCP
echo "Starting CLI tool..."
node dist/cli/index.js --help

echo ""
echo "Use 'node dist/cli/index.js generate --url <url>' to generate assets."
echo "Use 'node dist/cli/index.js mcp' to launch the MCP stdio server."
echo ""
