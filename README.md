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
clanker tools install ziggle-dev/voice-input
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

- **Clanker Configuration** - Must have Clanker configured with an API key in `~/.clanker/settings.json`
- **Input Tool** - Automatically installed as a dependency

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
  },
  "voiceAssistant": {
    "enabled": true,           // Enable always-on voice assistant
    "wakeWords": [            // Wake words to activate
      "hey jarvis",
      "hey clanker"
    ],
    "userTitle": "sir",       // How the AI addresses you
    "sensitivity": 0.5,       // Wake word detection sensitivity (0.0-1.0)
    "autoStart": true,        // Auto-start daemon when tool is used
    "notificationsEnabled": true,  // Desktop notifications
    "language": "en-US"       // Language for speech recognition
  }
}
```

## Usage

### Basic Voice Input

```bash
clanker tools run ziggle-dev/voice-input --mode voice
```

### Text Input Mode

```bash
clanker tools run ziggle-dev/voice-input --mode text --prompt "What's your name?"
```

### Voice Input with Custom Settings

```bash
clanker tools run ziggle-dev/voice-input --mode voice --duration 10 --language es-ES
```

### Auto Mode (Uses Configuration)

```bash
clanker tools run ziggle-dev/voice-input
```

## Tool Arguments

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| mode | string | No | auto | Input mode: voice, text, or auto |
| duration | number | No | 5 | Recording duration in seconds (max: 30) |
| language | string | No | en-US | Language code for speech recognition |
| prompt | string | No | - | Optional prompt to guide input |
| continuous | boolean | No | false | Enable continuous listening (voice only) |
| daemon | string | No | - | Control voice assistant: start, stop, status, ask |
| message | string | No | - | Message for ask command |

## Always-On Voice Assistant

When enabled in settings, the voice input tool includes an always-on voice assistant that listens for wake words and executes commands hands-free.

### Voice Assistant Commands

#### Start the Assistant
```bash
clanker tools run voice_input --daemon start
```

#### Stop the Assistant
```bash
clanker tools run voice_input --daemon stop
```

#### Check Status
```bash
clanker tools run voice_input --daemon status
```

#### AI Can Ask You Questions
```bash
# The AI can use this to communicate with you
clanker tools run voice_input --daemon ask --message "Would you like me to continue with the deployment?"
```

### How It Works

1. **Auto-Start**: If enabled in settings, the voice assistant daemon starts automatically when any Clanker tool is used
2. **Wake Words**: Say "Hey Jarvis" or "Hey Clanker" to activate
3. **Command Processing**: After wake word detection, speak your command
4. **Execution**: Commands are executed through Clanker CLI
5. **Notifications**: Desktop notifications keep you informed of status

### Features

- 🎤 **Always Listening**: Runs continuously in background
- 🔊 **Wake Word Detection**: Responds to "Hey Jarvis" or "Hey Clanker"
- 💬 **Natural Commands**: Speak any Clanker command naturally
- 🔔 **Desktop Notifications**: Visual feedback for all interactions
- 🤖 **AI Communication**: AI can ask you questions using the ask command
- 🎯 **Customizable**: Configure wake words, sensitivity, and user title

## Examples

### Voice Command Input
```bash
# Capture a 3-second voice command
clanker tools run ziggle-dev/voice-input --mode voice --duration 3 --prompt "Say your command"
```

### Text Dialog Input
```bash
# Show text input dialog
clanker tools run ziggle-dev/voice-input --mode text --prompt "Enter your email"
```

### Multi-language Voice Input
```bash
# Spanish
clanker tools run ziggle-dev/voice-input --mode voice --language es-ES

# French
clanker tools run ziggle-dev/voice-input --mode voice --language fr-FR

# Japanese
clanker tools run ziggle-dev/voice-input --mode voice --language ja-JP
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

## Output

The tool returns the captured input as plain text in the `output` field, with additional metadata in the `data` field:

### Voice Mode Output
```json
{
  "success": true,
  "output": "Hello, this is my voice input",
  "data": {
    "mode": "voice",
    "transcription": "Hello, this is my voice input",
    "duration": 5,
    "language": "en-US"
  }
}
```

### Text Mode Output
```json
{
  "success": true,
  "output": "User typed text",
  "data": {
    "mode": "text",
    "input": "User typed text"
  }
}
```

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
The ziggle-dev/input tool is automatically installed as a dependency. If issues persist:
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