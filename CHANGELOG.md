# Changelog

## [3.2.1] - 2025-08-25

### Fixed
- Reverted bundling strategy to keep dependencies external for proper npm installation
- Optimized build process for better compatibility with Clanker's module loading system

### Technical
- Dependencies are now properly marked as external in the build process
- Maintains smaller bundle size by not including node_modules in the output

## [3.2.0] - 2024-01-08

### Changed
- Switched from Clanker API to ElevenLabs Scribe API for speech-to-text transcription
- Improved API key management to use shared state from context
- Disabled auto-start of voice assistant daemon to prevent interference with Clanker
- Enhanced wake word detection with fuzzy matching for "Hey Clanker"

### Added
- Microphone device selection capability
- Device listing command (`daemon devices`)
- Better logging for daemon operations
- Continuous mode improvements

### Fixed
- Fixed daemon auto-starting and interfering with normal Clanker operations
- Improved error handling for API failures
- Better cleanup of audio processes

## [3.1.0] - Previous version
- Initial voice input implementation
- Voice assistant daemon with wake word detection
- Text input mode via system dialogs