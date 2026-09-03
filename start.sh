#!/bin/bash
echo "Starting Store Assets Generator Desktop Application..."

# Check if build exists, if not build it
if [ ! -d "dist" ]; then
    echo "Compiling TypeScript project..."
    npm run build
fi

npm start
