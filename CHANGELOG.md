# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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