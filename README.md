# Clanker Voice Input Tool

A flexible input abstraction tool for Clanker that supports both voice (via microphone) and text input modes. This tool provides a unified interface for getting user input, configurable via `~/.clanker/settings.json`.

## Features

- 🎤 **Voice Input**: Capture audio from system microphone with speech-to-text
- ⌨️ **Text Input**: Use system dialogs for text input (via ziggle-dev/input tool)
- 🔄 **Mode Switching**: Easily switch between voice and text modes
- ⚙️ **Configurable**: Set default behavior in ~/.clanker/settings.json
- 🌍 **Multi-language**: Support for multiple languages in voice mode
- 🔁 **Continuous Mode**: Hands-free continuous voice listening
- 🔌 **Clanker Integration**: Uses core Clanker API for speech processing

## Installation

```bash
npm install clanker-voice-input
```

### Prerequisites

#### For Voice Mode

**SoX** - Sound eXchange utility for audio recording

```bash
# macOS
brew install sox

# Ubuntu/Debian
sudo apt-get install sox

# Windows
# Option 1: Using Chocolatey
choco install sox

# Option 2: Manual installation
# Download from http://sox.sourceforge.net
# Add to PATH environment variable
```

#### For All Modes

**Clanker Configuration** - Must have Clanker configured with an API key in `~/.clanker/settings.json`

## Configuration

Configure default behavior in `~/.clanker/settings.json`:

```json
{
  "apiKey": "your-api-key",
  "provider": "grok",
  "input": {
    "mode": "voice",  // Default mode: "voice" or "text"
    "voiceSettings": {
      "duration": 5,      // Default recording duration
      "language": "en-US" // Default language
    }
  }
}
```

## Usage

### Basic Usage (Uses Default Mode)

```bash
clanker-voice-input
```

### Text Input Mode

```bash
clanker-voice-input --mode text
```

### Voice Input with Custom Duration

```bash
clanker-voice-input --mode voice --duration 10
```

### Continuous Voice Mode

```bash
clanker-voice-input --continuous
```

### With Custom Prompt

```bash
clanker-voice-input --prompt "What's your command?"
```

## Arguments

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| duration | number | No | 5 (or from settings) | Recording duration in seconds (max: 30) |
| language | string | No | en-US (or from settings) | Language code for speech recognition |
| prompt | string | No | - | Optional prompt to guide input |
| mode | string | No | From settings or 'voice' | Input mode: voice, text, or auto |
| continuous | boolean | No | false | Enable continuous listening (voice only) |

## Output Format

### Voice Mode (Single)
```json
{
  "success": true,
  "mode": "voice",
  "transcription": "Hello, this is my voice input",
  "duration": 5,
  "language": "en-US"
}
```

### Text Mode
```json
{
  "success": true,
  "mode": "text",
  "input": "User typed text"
}
```

### Continuous Voice Mode
```json
{
  "success": true,
  "mode": "continuous-voice",
  "transcriptions": [
    "First voice command",
    "Second voice command"
  ],
  "count": 2
}
```

## Examples

### Interactive Command Input
```bash
# Voice command
clanker-voice-input --mode voice --duration 3 --prompt "Say your command"

# Text command
clanker-voice-input --mode text --prompt "Enter your command"
```

### Multi-language Voice Input
```bash
# Spanish
clanker-voice-input --language es-ES

# French
clanker-voice-input --language fr-FR

# Japanese
clanker-voice-input --language ja-JP
```

### Script Integration
```javascript
const { exec } = require('child_process');

// Get voice input
exec('clanker-voice-input --mode voice', (error, stdout) => {
  const result = JSON.parse(stdout);
  if (result.success) {
    console.log('User said:', result.transcription);
  }
});

// Get text input
exec('clanker-voice-input --mode text --prompt "Enter your name"', (error, stdout) => {
  const result = JSON.parse(stdout);
  if (result.success) {
    console.log('User entered:', result.input);
  }
});
```

## Language Codes

Common language codes for voice input:
- `en-US` - English (US)
- `en-GB` - English (UK)
- `es-ES` - Spanish (Spain)
- `es-MX` - Spanish (Mexico)
- `fr-FR` - French
- `de-DE` - German
- `it-IT` - Italian
- `pt-BR` - Portuguese (Brazil)
- `ja-JP` - Japanese
- `ko-KR` - Korean
- `zh-CN` - Chinese (Simplified)

## Troubleshooting

### "SoX is required" Error
Install SoX for your platform (see Prerequisites).

### "No API key found" Error
Configure Clanker with your API key:
```bash
clanker --configure
```

### Windows Audio Issues
- Ensure SoX is in your PATH
- Try running as administrator
- Check Windows audio permissions

### Poor Voice Recognition
- Speak clearly at moderate pace
- Reduce background noise
- Use the `prompt` parameter for context
- Try different language codes

### Text Input Not Working
Ensure the ziggle-dev/input tool is accessible:
```bash
clanker tools install ziggle-dev/input
```

## How It Works

1. **Voice Mode**: Records audio using SoX, sends to Clanker API for transcription
2. **Text Mode**: Delegates to ziggle-dev/input tool for system dialogs
3. **Settings**: Reads ~/.clanker/settings.json for defaults and API configuration
4. **API Integration**: Uses the same API endpoint as configured in Clanker

## Security

- Audio is processed locally and sent only to your configured API
- No audio is stored permanently
- API credentials are read from Clanker's secure configuration
- Text input uses system-native secure dialogs

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Created by James for the Clanker ecosystem