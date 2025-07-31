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
  // Set up logging
  const logFile = path.join(os.homedir(), '.clanker', 'voice-assistant.log');
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
    console.log('[DAEMON] Wake word detected');
  });

  daemon.on('command-recognized', (command: string) => {
    console.log(`[DAEMON] Command: "${command}"`);
  });

  daemon.on('command-executed', ({ command, output }: any) => {
    console.log('[DAEMON] Command executed successfully');
  });

  daemon.on('command-error', ({ command, error }: any) => {
    console.error('[DAEMON] Command error:', error);
  });

  daemon.on('error', (error: Error) => {
    console.error('[DAEMON] Error:', error.message);
  });

  // Start listening
  await daemon.startListening();
  console.log('[DAEMON] Voice assistant is listening...');
  console.log(`[DAEMON] Wake words: ${settings.wakeWords.join(', ')}`);
  console.log(`[DAEMON] User title: ${settings.userTitle}`);

  // Keep process alive
  process.on('SIGTERM', async () => {
    console.log('[DAEMON] Shutting down...');
    await daemon.stopListening();
    process.exit(0);
  });

  // Prevent exit
  setInterval(() => {}, 1000);
}

run().catch(error => {
  console.error('[DAEMON] Failed to start:', error);
  process.exit(1);
});