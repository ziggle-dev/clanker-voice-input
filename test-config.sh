#!/bin/bash

# Create a temporary config directory
export TEMP_CONFIG_DIR=$(mktemp -d)
export HOME=$TEMP_CONFIG_DIR

# Create test settings
mkdir -p "$TEMP_CONFIG_DIR/.clanker"
cat > "$TEMP_CONFIG_DIR/.clanker/settings.json" << 'EOF'
{
  "apiKey": "test-api-key",
  "provider": "grok",
  "input": {
    "mode": "text",
    "voiceSettings": {
      "duration": 10,
      "language": "es-ES"
    }
  }
}
EOF

echo "Testing with custom config at: $TEMP_CONFIG_DIR/.clanker/settings.json"
echo "Config contents:"
cat "$TEMP_CONFIG_DIR/.clanker/settings.json"
echo ""

# Run tool with default (should use text mode from config)
echo "Test 1: Default mode (should be text from config)"
./dist/index.js --mode text --prompt "Test input" 2>&1 | head -20

# Cleanup
rm -rf "$TEMP_CONFIG_DIR"