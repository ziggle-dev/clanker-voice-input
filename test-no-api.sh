#!/bin/bash

# Create a temporary config directory
export TEMP_CONFIG_DIR=$(mktemp -d)
export HOME=$TEMP_CONFIG_DIR

# Create test settings without API key
mkdir -p "$TEMP_CONFIG_DIR/.clanker"
cat > "$TEMP_CONFIG_DIR/.clanker/settings.json" << 'EOF'
{
  "provider": "grok",
  "input": {
    "mode": "voice"
  }
}
EOF

echo "Testing without API key..."
echo ""

# Try to use voice mode (should fail with API key error)
echo "Expected error: No API key found"
./dist/index.js --mode voice --duration 1 2>&1 || true

# Cleanup
rm -rf "$TEMP_CONFIG_DIR"