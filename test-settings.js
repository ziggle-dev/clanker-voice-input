#!/usr/bin/env node

import { loadClankerSettings } from './dist/index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Test function to check settings loading
async function testSettings() {
  console.log('Testing settings loading...\n');
  
  // Create temporary test settings
  const settingsDir = path.join(os.homedir(), '.clanker');
  const settingsPath = path.join(settingsDir, 'settings.json');
  
  // Backup existing settings if any
  let backup = null;
  try {
    backup = await fs.readFile(settingsPath, 'utf-8');
  } catch (e) {
    // No existing settings
  }
  
  // Create test settings
  const testSettings = {
    apiKey: "test-api-key",
    provider: "grok",
    input: {
      mode: "text",
      voiceSettings: {
        duration: 10,
        language: "es-ES"
      }
    }
  };
  
  try {
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(testSettings, null, 2));
    
    // Load settings
    const loaded = await loadClankerSettings();
    
    console.log('Loaded settings:', JSON.stringify(loaded, null, 2));
    console.log('\nTest results:');
    console.log('✓ API Key loaded:', loaded.apiKey === testSettings.apiKey);
    console.log('✓ Provider loaded:', loaded.provider === testSettings.provider);
    console.log('✓ Input mode loaded:', loaded.input?.mode === testSettings.input.mode);
    console.log('✓ Voice duration loaded:', loaded.input?.voiceSettings?.duration === testSettings.input.voiceSettings.duration);
    console.log('✓ Voice language loaded:', loaded.input?.voiceSettings?.language === testSettings.input.voiceSettings.language);
    
  } finally {
    // Restore backup
    if (backup) {
      await fs.writeFile(settingsPath, backup);
    }
  }
}

// Run test
testSettings().catch(console.error);