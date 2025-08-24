#!/usr/bin/env node

/**
 * Daemon runner - Runs the voice assistant in background
 */

import { VoiceAssistantDaemon, defaultAssistantSettings } from './voice-assistant-daemon.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function loadSettings() {
  const settingsPath = path.join(os.homedir(), '.clanker', 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    return {
      ...defaultAssistantSettings,
      ...settings.voiceAssistant
    };
  } catch {
    return defaultAssistantSettings;
  }
}

async function run() {
  // Ensure .clanker directory exists
  const clankerDir = path.join(os.homedir(), '.clanker');
  await fs.mkdir(clankerDir, { recursive: true });
  
  // Set up logging
  const logFile = path.join(clankerDir, 'voice-assistant.log');
  const logStream = await fs.open(logFile, 'a');
  
  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    logStream.write(logMessage);
    console.log(message);
  };
  
  log('Starting voice assistant daemon...');
  
  const settings = await loadSettings();
  log(`Settings loaded: ${JSON.stringify(settings)}`);
  
  const daemon = new VoiceAssistantDaemon(settings);

  // Setup event handlers
  daemon.on('wake-word-detected', () => {
    log('[DAEMON] Wake word detected - listening for command...');
  });

  daemon.on('command-recognized', (command: string) => {
    log(`[DAEMON] Command recognized: "${command}"`);
  });

  daemon.on('command-executed', ({ command, output }: any) => {
    log('[DAEMON] Command executed successfully');
    if (output && output.length < 200) {
      log(`[DAEMON] Output: ${output}`);
    }
  });

  daemon.on('command-error', ({ command, error }: any) => {
    log(`[DAEMON] Command error: ${error}`);
  });

  daemon.on('error', (error: Error) => {
    log(`[DAEMON] Error: ${error.message}`);
  });
  
  daemon.on('processing-command', () => {
    log('[DAEMON] Processing command...');
  });

  // Start listening
  await daemon.startListening();
  log('[DAEMON] Voice assistant is listening...');
  log(`[DAEMON] Wake words: ${settings.wakeWords.join(', ')}`);
  log(`[DAEMON] User title: ${settings.userTitle}`);
  log(`[DAEMON] Microphone: ${settings.microphoneDevice || 'default'}`);
  log(`[DAEMON] Continuous mode: ${settings.continuousMode}`);
  log(`[DAEMON] Wake word timeout: ${settings.wakeWordTimeout}ms`);

  // Handle shutdown signals
  const shutdown = async () => {
    log('[DAEMON] Shutting down...');
    await daemon.stopListening();
    await logStream.close();
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Prevent exit
  setInterval(() => {}, 1000);
}

run().catch(error => {
  console.error('[DAEMON] Failed to start:', error);
  process.exit(1);
});