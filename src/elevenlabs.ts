/**
 * ElevenLabs STT integration
 */

import { ToolContext } from '@ziggler/clanker';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface ClankerSettings {
  elevenLabsApiKey?: string;
  [key: string]: any;
}

async function loadClankerSettings(): Promise<ClankerSettings> {
  const settingsPath = path.join(os.homedir(), '.clanker', 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function getElevenLabsApiKey(context?: ToolContext): Promise<string | undefined> {
  // Try to get from context shared state first
  if (context) {
    const contextWithSharedState = context as any;
    if (contextWithSharedState.sharedState) {
      // Check for ElevenLabs API key in shared state
      const elevenLabsKey = contextWithSharedState.sharedState.get('elevenlabs:apiKey');
      if (elevenLabsKey && typeof elevenLabsKey === 'string') {
        return elevenLabsKey;
      }
    }
  }

  // Fall back to settings file
  const settings = await loadClankerSettings();
  return settings.elevenLabsApiKey;
}

export async function transcribeWithElevenLabs(audioBuffer: Buffer, language: string, prompt?: string, context?: ToolContext): Promise<string> {
  const apiKey = await getElevenLabsApiKey(context);
  
  if (!apiKey) {
    throw new Error('ElevenLabs API key not found. Please configure it in ~/.clanker/settings.json');
  }

  // Create form data for ElevenLabs Scribe API
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.wav',
    contentType: 'audio/wav'
  });
  form.append('model_id', 'scribe_v1');
  form.append('language_code', language.split('-')[0]); // Convert en-US to en
  if (prompt) {
    form.append('prompt', prompt);
  }

  // Make API request to ElevenLabs
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      ...form.getHeaders()
    },
    body: form as any
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs STT error: ${response.status} - ${error}`);
  }

  const result = await response.json() as { text: string };
  return result.text;
}