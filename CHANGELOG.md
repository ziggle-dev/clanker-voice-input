# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-01-30

### Changed
- **BREAKING**: Removed direct Grok API integration in favor of core Clanker API
- **BREAKING**: Removed `grokApiKey` parameter - now uses Clanker's configured API
- Complete rewrite as an input abstraction layer supporting both voice and text modes
- Now depends on ziggle-dev/input tool for text input functionality

### Added
- Text input mode using system dialogs (via ziggle-dev/input tool)
- Mode switching between voice and text input
- Configuration support via ~/.clanker/settings.json
- Auto mode that uses configured default
- Windows installation instructions for SoX
- Unified output format for both input modes

### Improved
- Better integration with Clanker ecosystem
- Centralized API configuration
- More flexible input handling
- Enhanced error messages

## [1.0.0] - 2025-01-30

### Added
- Initial release of clanker-voice-input tool
- Voice recording capability using system microphone
- Speech-to-text conversion using Grok's Whisper API
- Support for multiple languages
- Configurable recording duration (up to 30 seconds)
- Continuous listening mode for hands-free operation
- Optional prompts to guide speech recognition
- Comprehensive error handling and user feedback
- Support for environment variable API key configuration

### Features
- Modern builder pattern implementation using @clanker/tools-runtime
- TypeScript support with full type definitions
- Cross-platform audio recording via SoX
- Automatic temporary file cleanup
- Detailed logging for debugging

### Documentation
- Complete README with installation instructions
- Usage examples for all features
- Troubleshooting guide
- Supported language codes reference