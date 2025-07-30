#!/usr/bin/env node

import record from 'node-record-lpcm16';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

interface VoiceInputArgs {
  duration: number;
  language: string;
  prompt?: string;
  continuous: boolean;
  mode?: 'voice' | 'text' | 'auto';
}

interface InputConfig {
  mode: 'voice' | 'text';
  voiceSettings?: {
    duration?: number;
    language?: string;
  };
}

interface ClankerSettings {
  input?: InputConfig;
  apiKey?: string;
  provider?: string;
  customBaseURL?: string;
}

interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const logger: Logger = {
  info: (message: string) => console.log(`ℹ️  ${message}`),
  success: (message: string) => console.log(`✅ ${message}`),
  error: (message: string) => console.error(`❌ ${message}`)
};

async function loadClankerSettings(): Promise<ClankerSettings> {
  const settingsPath = path.join(os.homedir(), '.clanker', 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function checkSoxInstalled(): Promise<void> {
  try {
    await execAsync('which sox');
  } catch {
    throw new Error('SoX is required for audio recording. Please install it:\n' +
      '  macOS: brew install sox\n' +
      '  Linux: sudo apt-get install sox\n' +
      '  Windows: choco install sox (or download from http://sox.sourceforge.net)');
  }
}

async function callClankerAPI(audioBuffer: Buffer, language: string, prompt?: string): Promise<string> {
  // Load settings to get API configuration
  const settings = await loadClankerSettings();
  
  if (!settings.apiKey) {
    throw new Error('No API key found in ~/.clanker/settings.json. Please configure Clanker first.');
  }

  // Determine API endpoint based on provider
  let baseURL = 'https://api.x.ai/v1';
  if (settings.provider === 'openai') {
    baseURL = 'https://api.openai.com/v1';
  } else if (settings.provider === 'custom' && settings.customBaseURL) {
    baseURL = settings.customBaseURL;
  }

  // Create form data for audio transcription
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.wav',
    contentType: 'audio/wav'
  });
  form.append('model', 'whisper-large-v3');
  form.append('language', language.split('-')[0]);
  if (prompt) {
    form.append('prompt', prompt);
  }

  // Make API request using node-fetch
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(`${baseURL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      ...form.getHeaders()
    },
    body: form as any
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const result = await response.json() as { text: string };
  return result.text;
}

async function recordVoice(duration: number, language: string, prompt?: string): Promise<string> {
  // Create temporary file for audio
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-input-'));
  const audioFile = path.join(tempDir, 'recording.wav');

  return new Promise((resolve, reject) => {
    // Set up recording
    const recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: 'sox',
      silence: '1.0',
      threshold: '2%',
      thresholdStart: null,
      thresholdEnd: null,
      keepSilence: true
    });

    const audioStream = recording.stream();
    const chunks: Buffer[] = [];

    audioStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    audioStream.on('error', (err: Error) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });

    // Stop recording after duration
    setTimeout(() => {
      recording.stop();
    }, duration * 1000);

    audioStream.on('end', async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        await fs.writeFile(audioFile, audioBuffer);
        
        logger.info('Recording complete. Processing with Clanker API...');

        // Use Clanker API for transcription
        const transcription = await callClankerAPI(audioBuffer, language, prompt);

        // Clean up temp files
        await fs.rm(tempDir, { recursive: true, force: true });

        resolve(transcription);
      } catch (error: any) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        reject(new Error(`Transcription error: ${error.message}`));
      }
    });
  });
}

async function getTextInput(prompt?: string): Promise<string> {
  try {
    // Use the clanker tools command to run input tool
    const { execSync } = await import('child_process');
    
    // Build the command with proper escaping
    const promptArg = prompt ? `--prompt "${prompt.replace(/"/g, '\\"')}"` : '';
    const command = `clanker tools run ziggle-dev/input ${promptArg}`;
    
    const result = execSync(command, { encoding: 'utf-8' });
    
    // Parse the JSON output from the input tool
    const parsed = JSON.parse(result);
    if (parsed.success && parsed.output) {
      return parsed.output;
    } else {
      throw new Error(parsed.error || 'Failed to get input');
    }
  } catch (error: any) {
    throw new Error(`Text input error: ${error.message}`);
  }
}

async function main() {
  try {
    // Parse command line arguments
    const { values } = parseArgs({
      options: {
        duration: {
          type: 'string',
          short: 'd',
          default: '5'
        },
        language: {
          type: 'string',
          short: 'l',
          default: 'en-US'
        },
        prompt: {
          type: 'string',
          short: 'p'
        },
        continuous: {
          type: 'boolean',
          short: 'c',
          default: false
        },
        mode: {
          type: 'string',
          short: 'm'
        },
        help: {
          type: 'boolean',
          short: 'h'
        }
      }
    });

    if (values.help) {
      console.log(`
Clanker Voice Input Tool

A flexible input tool that supports both voice (via microphone) and text input modes.
Configurable via ~/.clanker/settings.json

Usage: clanker-voice-input [options]

Options:
  -d, --duration <seconds>     Recording duration in seconds (default: 5, max: 30)
  -l, --language <code>        Language code for speech recognition (default: en-US)
  -p, --prompt <text>          Optional prompt to guide input
  -m, --mode <mode>            Input mode: voice, text, or auto (default: from settings or voice)
  -c, --continuous             Enable continuous listening mode (voice only)
  -h, --help                   Show this help message

Configuration (in ~/.clanker/settings.json):
  {
    "input": {
      "mode": "voice",  // or "text"
      "voiceSettings": {
        "duration": 5,
        "language": "en-US"
      }
    }
  }

Examples:
  clanker-voice-input                          # Use default mode from settings
  clanker-voice-input --mode text              # Force text input mode
  clanker-voice-input --mode voice --duration 10   # Voice input for 10 seconds
  clanker-voice-input --continuous             # Continuous voice listening
`);
      process.exit(0);
    }

    // Load settings
    const settings = await loadClankerSettings();
    const inputConfig = settings.input || { mode: 'voice' };

    // Determine input mode
    let inputMode: 'voice' | 'text' = 'voice';
    if (values.mode) {
      if (values.mode === 'voice' || values.mode === 'text') {
        inputMode = values.mode;
      } else if (values.mode === 'auto') {
        // Auto mode: use settings or default to voice
        inputMode = inputConfig.mode || 'voice';
      } else {
        logger.error(`Invalid mode: ${values.mode}. Use 'voice', 'text', or 'auto'.`);
        process.exit(1);
      }
    } else {
      inputMode = inputConfig.mode || 'voice';
    }

    const args: VoiceInputArgs = {
      duration: Math.min(parseInt(values.duration || inputConfig.voiceSettings?.duration?.toString() || '5'), 30),
      language: values.language || inputConfig.voiceSettings?.language || 'en-US',
      prompt: values.prompt,
      continuous: values.continuous || false,
      mode: inputMode
    };

    // Handle text input mode
    if (inputMode === 'text') {
      if (args.continuous) {
        logger.error('Continuous mode is not supported for text input.');
        process.exit(1);
      }

      logger.info('Using text input mode...');
      const text = await getTextInput(args.prompt);
      
      console.log(JSON.stringify({
        success: true,
        mode: 'text',
        input: text
      }, null, 2));
      
      return;
    }

    // Voice input mode
    await checkSoxInstalled();

    if (args.continuous) {
      logger.info('Continuous voice listening mode enabled. Press Ctrl+C to stop.');
      const results: string[] = [];
      
      process.on('SIGINT', () => {
        console.log('\n\nStopping continuous listening...');
        console.log(JSON.stringify({
          success: true,
          mode: 'continuous-voice',
          transcriptions: results,
          count: results.length
        }, null, 2));
        process.exit(0);
      });

      while (true) {
        try {
          logger.info(`Starting voice recording for ${args.duration} seconds...`);
          logger.info('Speak now...');
          
          const text = await recordVoice(args.duration, args.language, args.prompt);
          if (text.trim()) {
            results.push(text);
            logger.success(`Transcribed: ${text}`);
            logger.info('Listening for next input...');
          }
        } catch (error: any) {
          logger.error(`Error: ${error.message}`);
        }
      }
    } else {
      logger.info(`Starting voice recording for ${args.duration} seconds...`);
      logger.info('Speak now...');
      
      const text = await recordVoice(args.duration, args.language, args.prompt);
      
      console.log(JSON.stringify({
        success: true,
        mode: 'voice',
        transcription: text,
        duration: args.duration,
        language: args.language
      }, null, 2));
    }
  } catch (error: any) {
    logger.error(`Input failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { recordVoice, getTextInput };
export type { VoiceInputArgs };