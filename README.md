# Clanker Voice Input Tool

A voice input tool for Clanker that captures audio from the system microphone and converts it to text using Grok's speech-to-text API.

## Features

- 🎤 Capture voice input from system microphone
- 🔤 Convert speech to text using Grok's Whisper model
- 🌍 Support for multiple languages
- 🔁 Continuous listening mode for hands-free operation
- ⏱️ Configurable recording duration
- 🎯 Optional prompts to guide speech recognition

## Installation

```bash
npm install clanker-voice-input
```

### Prerequisites

1. **SoX** - Sound eXchange utility for audio recording
   ```bash
   # macOS
   brew install sox

   # Ubuntu/Debian
   sudo apt-get install sox

   # Windows (via Chocolatey)
   choco install sox
   ```

2. **Grok API Key** - Get your API key from [x.ai](https://x.ai)

## Usage

### Basic Voice Input (5 seconds)

```bash
clanker voice-input
```

### Custom Duration

```bash
clanker voice-input --duration 10
```

### With Language Specification

```bash
clanker voice-input --language es-ES --duration 8
```

### Continuous Listening Mode

```bash
clanker voice-input --continuous --prompt "Listening for commands"
```

### With API Key

```bash
clanker voice-input --grokApiKey YOUR_API_KEY
```

Or set via environment variable:

```bash
export GROK_API_KEY=YOUR_API_KEY
clanker voice-input
```

## Arguments

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| duration | number | No | 5 | Recording duration in seconds (max: 30) |
| language | string | No | en-US | Language code for speech recognition |
| prompt | string | No | - | Optional prompt to guide speech recognition |
| grokApiKey | string | No | - | Grok API key (or use GROK_API_KEY env var) |
| continuous | boolean | No | false | Enable continuous listening mode |

## Examples

### Voice Command Input
```bash
# Capture a voice command
clanker voice-input --duration 3 --prompt "User command"
```

### Dictation Mode
```bash
# Longer recording for dictation
clanker voice-input --duration 20 --prompt "Dictating a message"
```

### Multi-language Support
```bash
# Spanish voice input
clanker voice-input --language es-ES

# French voice input
clanker voice-input --language fr-FR

# Japanese voice input
clanker voice-input --language ja-JP
```

### Continuous Mode for Interactive Sessions
```bash
# Start continuous listening (press Ctrl+C to stop)
clanker voice-input --continuous --prompt "Waiting for next command"
```

## Output Format

### Single Recording Mode
```json
{
  "success": true,
  "mode": "single",
  "transcription": "Hello, this is my voice input",
  "duration": 5,
  "language": "en-US"
}
```

### Continuous Mode
```json
{
  "success": true,
  "mode": "continuous",
  "transcriptions": [
    "First voice input",
    "Second voice input",
    "Third voice input"
  ],
  "count": 3
}
```

## Language Codes

Common language codes supported:
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
Make sure SoX is installed on your system. See Prerequisites section.

### "Recording error" 
- Check microphone permissions
- Ensure microphone is not being used by another application
- Try adjusting system audio input settings

### "Transcription error"
- Verify your Grok API key is valid
- Check your internet connection
- Ensure the audio quality is sufficient (quiet environment)

### Poor Recognition Quality
- Speak clearly and at a moderate pace
- Reduce background noise
- Use the `prompt` parameter to provide context
- Try a different language code if applicable

## Security Notes

- API keys should be stored securely, preferably as environment variables
- Audio is processed locally and sent to Grok's API for transcription
- No audio is stored permanently by this tool

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Created by James for the Clanker ecosystem