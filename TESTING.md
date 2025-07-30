# Testing Guide for Clanker Voice Input Tool

This document outlines the testing procedures for the clanker-voice-input tool.

## Prerequisites

1. **For Voice Mode Testing**:
   - Install SoX: `brew install sox` (macOS) or `sudo apt-get install sox` (Linux)
   - Ensure microphone permissions are granted
   - Have a valid API key configured in ~/.clanker/settings.json

2. **For Text Mode Testing**:
   - Install the input tool: `clanker tools install ziggle-dev/input`

## Test Cases

### 1. Basic Functionality Tests

#### Test 1.1: Help Command
```bash
./dist/index.js --help
```
**Expected**: Display help information with all options

#### Test 1.2: Voice Mode (with SoX installed)
```bash
./dist/index.js --mode voice --duration 3
```
**Expected**: 
- Shows "Starting voice recording for 3 seconds..."
- Records audio and transcribes it
- Returns JSON with transcription

#### Test 1.3: Text Mode
```bash
./dist/index.js --mode text --prompt "Enter your name"
```
**Expected**: 
- Shows system dialog for text input
- Returns JSON with input text

### 2. Configuration Tests

#### Test 2.1: Default Configuration
Create `~/.clanker/settings.json`:
```json
{
  "apiKey": "your-api-key",
  "provider": "grok",
  "input": {
    "mode": "text",
    "voiceSettings": {
      "duration": 10,
      "language": "es-ES"
    }
  }
}
```

```bash
./dist/index.js
```
**Expected**: Uses text mode by default (from config)

#### Test 2.2: Voice Settings from Config
```bash
./dist/index.js --mode voice
```
**Expected**: Uses duration=10 and language=es-ES from config

### 3. Error Handling Tests

#### Test 3.1: Missing SoX
```bash
# Without SoX installed
./dist/index.js --mode voice
```
**Expected**: Error message with installation instructions

#### Test 3.2: Missing API Key
Remove apiKey from ~/.clanker/settings.json, then:
```bash
./dist/index.js --mode voice
```
**Expected**: "No API key found in ~/.clanker/settings.json"

#### Test 3.3: Invalid Mode
```bash
./dist/index.js --mode invalid
```
**Expected**: "Invalid mode: invalid. Use 'voice', 'text', or 'auto'."

#### Test 3.4: Continuous Mode with Text
```bash
./dist/index.js --mode text --continuous
```
**Expected**: "Continuous mode is not supported for text input."

### 4. Integration Tests

#### Test 4.1: API Integration (requires valid API key)
```bash
# Record a simple phrase like "Hello world"
./dist/index.js --mode voice --duration 3
```
**Expected**: Successful transcription of the spoken phrase

#### Test 4.2: Multiple Languages
```bash
# Test different languages
./dist/index.js --mode voice --language es-ES --prompt "Habla en español"
./dist/index.js --mode voice --language fr-FR --prompt "Parlez en français"
```
**Expected**: Correct transcription in the specified language

### 5. Continuous Mode Tests

#### Test 5.1: Continuous Voice Mode
```bash
./dist/index.js --mode voice --continuous
```
**Expected**: 
- Continuous recording sessions
- Press Ctrl+C to stop
- Returns array of all transcriptions

## Manual Testing Checklist

- [ ] Help command displays correctly
- [ ] Voice mode works with valid API key and SoX
- [ ] Text mode displays system dialog
- [ ] Configuration file is read correctly
- [ ] Default values are applied from config
- [ ] Error messages are clear and helpful
- [ ] API errors are handled gracefully
- [ ] Continuous mode works for voice input
- [ ] Language selection works correctly
- [ ] Duration parameter is respected
- [ ] Output is valid JSON

## Automated Test Script

Run the included test script:
```bash
npm test
```

This will run through basic functionality tests that don't require user interaction.

## Known Limitations

1. Voice mode requires SoX to be installed
2. Text mode requires clanker and ziggle-dev/input tool
3. API transcription requires valid API key
4. Continuous mode only works with voice input
5. Maximum recording duration is 30 seconds

## Troubleshooting Test Failures

1. **SoX errors**: Ensure SoX is installed and in PATH
2. **API errors**: Check API key validity and network connection
3. **Text input errors**: Verify input tool is installed
4. **Permission errors**: Check microphone permissions (macOS/Windows)
5. **JSON parse errors**: Check for proper JSON output format