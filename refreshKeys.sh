#!/bin/bash

# Fetch JSON from URL
url="https://appleid.apple.com/auth/keys"
json=$(curl -s "$url")

cd /home/mikael/go/src/github.com/mglonnro/ais-social-api.beta

# Output as JavaScript default export
outputFile="keys/appleKeys.js"

echo "export default $json;" > $outputFile

echo "The JSON object has been fetched and saved as a default export in $outputFile"

/home/mikael/.nvm/versions/node/v16.20.2/bin/pm2 restart ecosystem.config.cjs
