#!/bin/bash
set -e
docker-compose up -d --build
npm install --include=dev
npm run integration-test
docker-compose down
