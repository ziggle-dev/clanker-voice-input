#!/bin/bash

echo "=== Clanker Voice Input Tool - Automated Tests ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_pattern="$3"
    
    echo -n "Testing $test_name... "
    
    if output=$($command 2>&1); then
        if echo "$output" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}PASSED${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}FAILED${NC}"
            echo "  Expected pattern: $expected_pattern"
            echo "  Got: $output" | head -3
            ((TESTS_FAILED++))
        fi
    else
        # Command failed - check if it's expected
        if [ -n "$expected_pattern" ] && echo "$output" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}PASSED${NC} (expected error)"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}FAILED${NC}"
            echo "  Output: $output" | head -3
            ((TESTS_FAILED++))
        fi
    fi
}

# Test 1: Help command
run_test "help command" "./dist/index.js --help" "Clanker Voice Input Tool"

# Test 2: Invalid mode
run_test "invalid mode error" "./dist/index.js --mode invalid" "Invalid mode: invalid"

# Test 3: Voice mode without SoX
if ! which sox > /dev/null 2>&1; then
    run_test "voice mode without SoX" "./dist/index.js --mode voice" "SoX is required"
else
    echo "Skipping SoX test (SoX is installed)"
fi

# Test 4: Continuous mode with text
run_test "continuous text mode error" "./dist/index.js --mode text --continuous" "Continuous mode is not supported for text input"

# Test 5: Check if tool is executable
if [ -x "./dist/index.js" ]; then
    echo -e "Testing tool executable... ${GREEN}PASSED${NC}"
    ((TESTS_PASSED++))
else
    echo -e "Testing tool executable... ${RED}FAILED${NC}"
    ((TESTS_FAILED++))
fi

# Summary
echo ""
echo "=== Test Summary ==="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed!${NC}"
    exit 1
fi