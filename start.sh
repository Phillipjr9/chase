#!/bin/bash
# Chase Clone — fullstack launcher
# Builds the frontend, then starts the API + static server.
# Open http://localhost:3000 and sign in with demo / chase123
set -e
echo "Building frontend..."
npm run build
echo "Starting fullstack server on http://localhost:3000 ..."
echo "(Press Ctrl+C to stop)"
node server/index.js
