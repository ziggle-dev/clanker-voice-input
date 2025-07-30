#!/usr/bin/env node

import record from 'node-record-lpcm16';
import { OpenAI } from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseArgs } from 'util';

const execAsync = promisify(exec);

interface VoiceInputArgs {
  duration: number;
  language: string;
  prompt?: string;
  grokApiKey?: string;
  continuous: boolean;
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

async function checkSoxInstalled(): Promise<void> {
  try {
    await execAsync('which sox');
  } catch {
    throw new Error('SoX is required for audio recording. Please install it: brew install sox');
  }
}

async function recordVoice(duration: number, language: string, prompt?: string, apiKey?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('Grok API key is required. Set via --grokApiKey argument or GROK_API_KEY environment variable.');
  }

  // Initialize OpenAI client with Grok endpoint
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1'
  });

  // Create temporary file for audio
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-input-'));
  const audioFile = path.join(tempDir, 'recording.wav');

  return new Promise((resolve, reject) => {
    // Set up recording with specific format for better compatibility
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
        
        logger.info('Recording complete. Processing with Grok...');

        // Read the audio file for the API
        const fileContent = await fs.readFile(audioFile);

        // Use Grok for transcription via OpenAI-compatible API
        const transcription = await openai.audio.transcriptions.create({
          file: fileContent as any,
          model: 'whisper-large-v3',
          language: language.split('-')[0], // Extract language code
          prompt: prompt
        } as any);

        // Clean up temp files
        await fs.rm(tempDir, { recursive: true, force: true });

        resolve(transcription.text);
      } catch (error: any) {
        reject(new Error(`Transcription error: ${error.message}`));
      }
    });
  });
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
        grokApiKey: {
          type: 'string',
          short: 'k'
        },
        continuous: {
          type: 'boolean',
          short: 'c',
          default: false
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

Usage: clanker-voice-input [options]

Options:
  -d, --duration <seconds>     Recording duration in seconds (default: 5, max: 30)
  -l, --language <code>        Language code for speech recognition (default: en-US)
  -p, --prompt <text>          Optional prompt to guide speech recognition
  -k, --grokApiKey <key>       Grok API key (or use GROK_API_KEY env var)
  -c, --continuous             Enable continuous listening mode
  -h, --help                   Show this help message

Examples:
  clanker-voice-input
  clanker-voice-input --duration 10
  clanker-voice-input --language es-ES --prompt "Spanish dictation"
  clanker-voice-input --continuous
`);
      process.exit(0);
    }

    const args: VoiceInputArgs = {
      duration: Math.min(parseInt(values.duration || '5'), 30),
      language: values.language || 'en-US',
      prompt: values.prompt,
      grokApiKey: values.grokApiKey || process.env.GROK_API_KEY,
      continuous: values.continuous || false
    };

    // Check prerequisites
    await checkSoxInstalled();

    if (args.continuous) {
      logger.info('Continuous listening mode enabled. Press Ctrl+C to stop.');
      const results: string[] = [];
      
      process.on('SIGINT', () => {
        console.log('\n\nStopping continuous listening...');
        console.log(JSON.stringify({
          success: true,
          mode: 'continuous',
          transcriptions: results,
          count: results.length
        }, null, 2));
        process.exit(0);
      });

      while (true) {
        try {
          logger.info(`Starting voice recording for ${args.duration} seconds...`);
          logger.info('Speak now...');
          
          const text = await recordVoice(args.duration, args.language, args.prompt, args.grokApiKey);
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
      
      const text = await recordVoice(args.duration, args.language, args.prompt, args.grokApiKey);
      
      console.log(JSON.stringify({
        success: true,
        mode: 'single',
        transcription: text,
        duration: args.duration,
        language: args.language
      }, null, 2));
    }
  } catch (error: any) {
    logger.error(`Voice input failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { recordVoice };
export type { VoiceInputArgs };