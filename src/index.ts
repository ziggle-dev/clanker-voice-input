/**
 * Voice Input Tool for Clanker
 * Advanced voice recording with intelligent silence detection
 * Acts as a transparent voice layer for Clanker
 */

import { createTool, ToolCategory, ToolCapability, ToolContext, ToolArguments } from '@ziggler/clanker';
import record from 'node-record-lpcm16';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Settings path (same as elevenlabs-tts)
const settingsPath = path.join(os.homedir(), '.clanker', 'settings.json');

// Tool settings interface
interface ToolSettings {
  apiKey?: string;
  language?: string;
  model?: string;
  autoSpeak?: boolean;
}

/**
 * Load tool settings from ~/.clanker/settings.json
 */
async function loadToolSettings(): Promise<ToolSettings | null> {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const settingsData = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsData);
    return settings.tools?.elevenlabs || null;
  } catch {
    return null;
  }
}

/**
 * Save tool settings
 */
async function saveToolSettings(toolSettings: ToolSettings): Promise<void> {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    
    let settings: any = {};
    try {
      const existingData = await fs.readFile(settingsPath, 'utf-8');
      settings = JSON.parse(existingData);
    } catch {
      // File doesn't exist yet
    }
    
    if (!settings.tools) {
      settings.tools = {};
    }
    
    settings.tools.elevenlabs = {
      ...settings.tools.elevenlabs,
      ...toolSettings
    };
    
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Get ElevenLabs API key from settings
 */
async function getApiKey(context?: ToolContext): Promise<string | undefined> {
  const settings = await loadToolSettings();
  if (settings?.apiKey) {
    return settings.apiKey;
  }
  
  // Try to prompt for API key if we have context
  if (context?.registry) {
    try {
      const result = await context.registry.execute('input', {
        prompt: 'Please enter your ElevenLabs API key:',
        title: 'ElevenLabs API Key Required',
        type: 'password'
      });
      
      if (result.success && result.output) {
        // Save the API key for future use
        await saveToolSettings({ apiKey: result.output });
        return result.output;
      }
    } catch (error) {
      context.logger?.error('Failed to prompt for API key:', error);
    }
  }
  
  return undefined;
}

/**
 * Check if SoX is installed
 */
async function checkSoxInstalled(): Promise<boolean> {
  try {
    await execAsync('which sox');
    return true;
  } catch {
    return false;
  }
}

/**
 * Record audio with intelligent silence detection
 */
async function recordAudioWithSilenceDetection(
  maxDuration: number, 
  minDuration: number = 0.5,
  silenceThreshold: string = '3%',
  silenceDuration: string = '1.2',
  context?: ToolContext
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let recordingTime = 0;
    const checkInterval = 100;
    
    context?.logger?.info(`🔴 Recording...`);
    
    // Configure recording with silence detection
    const recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: 'sox',
      silence: silenceDuration,
      threshold: silenceThreshold,
      thresholdStart: null,
      thresholdEnd: silenceThreshold,
      keepSilence: true
    });
    
    const stream = recording.stream();
    let hasData = false;
    
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunk.length > 0) {
        hasData = true;
      }
    });
    
    stream.on('error', (err: Error) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });
    
    // Check for minimum duration and timeout
    const timeoutCheck = setInterval(() => {
      recordingTime += checkInterval;
      
      // Force stop at max duration
      if (recordingTime >= maxDuration * 1000) {
        clearInterval(timeoutCheck);
        recording.stop();
        context?.logger?.debug('Maximum recording duration reached.');
      }
    }, checkInterval);
    
    stream.on('end', () => {
      clearInterval(timeoutCheck);
      const audioBuffer = Buffer.concat(chunks);
      
      if (audioBuffer.length < 1000) {
        context?.logger?.warn('Recording too short, might be just noise.');
      }
      
      context?.logger?.debug(`Recording complete (${(recordingTime / 1000).toFixed(1)}s).`);
      resolve(audioBuffer);
    });
    
    // Handle sox auto-stopping on silence
    stream.on('close', () => {
      clearInterval(timeoutCheck);
      if (chunks.length > 0) {
        const audioBuffer = Buffer.concat(chunks);
        context?.logger?.debug(`Recording stopped on silence detection.`);
        resolve(audioBuffer);
      }
    });
  });
}

/**
 * Record audio with fixed duration
 */
async function recordAudioFixed(duration: number, context?: ToolContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    context?.logger?.info(`🔴 Recording for ${duration} seconds...`);
    
    const recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: 'sox'
    });
    
    const stream = recording.stream();
    
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    stream.on('error', (err: Error) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });
    
    setTimeout(() => {
      recording.stop();
    }, duration * 1000);
    
    stream.on('end', () => {
      const audioBuffer = Buffer.concat(chunks);
      context?.logger?.info('Recording complete.');
      resolve(audioBuffer);
    });
  });
}

/**
 * Transcribe audio using ElevenLabs Scribe API
 */
async function transcribeAudio(
  audioBuffer: Buffer, 
  apiKey: string, 
  language: string = 'en', 
  context?: ToolContext
): Promise<string> {
  context?.logger?.debug('Transcribing with ElevenLabs Scribe...');
  
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  
  form.append('file', audioBuffer, {
    filename: 'recording.wav',
    contentType: 'audio/wav'
  });
  
  form.append('model_id', 'scribe_v1');
  form.append('language_code', language);
  
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
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }
  
  const result = await response.json() as { text: string };
  context?.logger?.info(`📝 Transcription: "${result.text}"`);
  
  return result.text;
}

/**
 * Speak text using TTS
 */
async function speakText(text: string, context: ToolContext, apiKey?: string): Promise<void> {
  if (!context.registry) {
    context.logger?.warn('TTS not available - no registry context');
    return;
  }
  
  try {
    await context.registry.execute('elevenlabs_tts', {
      action: 'speak',
      text: text,
      api_key: apiKey
    });
    
    // Small delay after TTS (reduced for performance)
    await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) {
    context.logger?.warn('Failed to speak via TTS:', error);
  }
}

/**
 * Voice Input Tool
 */
export default createTool()
  .id('voice_input')
  .name('Voice Input')
  .description('Voice recording with intelligent silence detection and TTS integration. Records audio and transcribes using ElevenLabs Scribe API. Perfect for voice-driven interactions.')
  .category(ToolCategory.Utility)
  .capabilities(ToolCapability.SystemExecute, ToolCapability.NetworkAccess)
  .tags('voice', 'input', 'audio', 'speech', 'microphone', 'transcription', 'stt', 'elevenlabs')
  
  // Arguments
  .stringArg('action', 'Action to perform: record, ask, enable_voice_mode, disable_voice_mode, status', {
    required: false,
    default: 'record',
    enum: ['record', 'ask', 'enable_voice_mode', 'disable_voice_mode', 'status']
  })
  .stringArg('prompt', 'Optional prompt to speak before recording', {
    required: false
  })
  .numberArg('duration', 'Max recording duration in seconds (1-60)', {
    required: false,
    default: 10
  })
  .numberArg('min_duration', 'Minimum recording duration before silence detection (0.5-5)', {
    required: false,
    default: 0.5
  })
  .stringArg('language', 'Language code for transcription (e.g., en, es, fr)', {
    required: false,
    default: 'en'
  })
  .stringArg('api_key', 'ElevenLabs API key (will use saved key if not provided)', {
    required: false
  })
  .booleanArg('speak_prompt', 'If true, speaks the prompt using TTS', {
    required: false,
    default: true
  })
  .booleanArg('auto_detect_silence', 'Use intelligent silence detection to stop recording', {
    required: false,
    default: true
  })
  .booleanArg('speak_response', 'Speak the response via TTS', {
    required: false,
    default: false
  })
  .stringArg('silence_threshold', 'Volume threshold for silence detection (e.g., 1%, 2%, 5%)', {
    required: false,
    default: '3%'
  })
  .stringArg('silence_duration', 'Duration of silence before stopping (e.g., 0.8, 1.0, 1.5)', {
    required: false,
    default: '1.2'
  })
  
  // Examples
  .examples([
    {
      description: 'Simple voice recording',
      arguments: {
        action: 'record'
      },
      result: 'Records until silence detected, returns transcription'
    },
    {
      description: 'Ask a question via voice',
      arguments: {
        action: 'ask',
        prompt: 'What would you like to do?'
      },
      result: 'Speaks prompt via TTS, records response, returns transcription'
    },
    {
      description: 'Enable voice mode for all interactions',
      arguments: {
        action: 'enable_voice_mode'
      },
      result: 'Enables voice mode - responses will be spoken via TTS'
    },
    {
      description: 'Fixed duration recording',
      arguments: {
        action: 'record',
        duration: 5,
        auto_detect_silence: false
      },
      result: 'Records exactly 5 seconds'
    },
    {
      description: 'Adjust silence detection sensitivity',
      arguments: {
        action: 'record',
        silence_threshold: '1%',
        silence_duration: '1.0'
      },
      result: 'More sensitive silence detection'
    }
  ])
  
  // Execute function
  .execute(async (args: ToolArguments, context: ToolContext) => {
    const { 
      action = 'record',
      prompt, 
      duration = 10,
      min_duration = 0.5,
      language = 'en',
      api_key,
      speak_prompt = true,
      auto_detect_silence = true,
      speak_response = false,
      silence_threshold = '3%',
      silence_duration = '1.2'
    } = args;
    
    // Handle control actions
    switch (action) {
      case 'enable_voice_mode':
        await saveToolSettings({ autoSpeak: true });
        return {
          success: true,
          output: 'Voice mode enabled. Responses will be spoken via TTS.'
        };
        
      case 'disable_voice_mode':
        await saveToolSettings({ autoSpeak: false });
        return {
          success: true,
          output: 'Voice mode disabled.'
        };
        
      case 'status':
        const settings = await loadToolSettings();
        return {
          success: true,
          output: `Voice Input Status:\n` +
                  `- Voice Mode: ${settings?.autoSpeak ? 'Enabled' : 'Disabled'}\n` +
                  `- API Key: ${settings?.apiKey ? 'Configured' : 'Not configured'}\n` +
                  `- Default Language: ${settings?.language || 'en'}`
        };
    }
    
    // Check if SoX is installed
    const soxInstalled = await checkSoxInstalled();
    if (!soxInstalled) {
      return {
        success: false,
        error: 'SoX is required for audio recording. Please install it:\n' +
               '  macOS: brew install sox\n' +
               '  Linux: sudo apt-get install sox\n' +
               '  Windows: choco install sox'
      };
    }
    
    // Get API key
    const finalApiKey = api_key || await getApiKey(context);
    if (!finalApiKey) {
      return {
        success: false,
        error: 'ElevenLabs API key is required. Please provide it or save it in settings.'
      };
    }
    
    // Load settings for voice mode
    const settings = await loadToolSettings();
    const voiceModeEnabled = speak_response || settings?.autoSpeak || false;
    
    try {
      // Handle 'ask' action - speak prompt then record
      if (action === 'ask') {
        // Speak the prompt if provided
        if (prompt && speak_prompt && context.registry) {
          await speakText(prompt, context, finalApiKey as string);
        } else if (prompt) {
          context.logger?.info(`📝 ${prompt}`);
        }
        
        // Record the response
        const audioBuffer = auto_detect_silence 
          ? await recordAudioWithSilenceDetection(
              duration as number,
              min_duration as number,
              silence_threshold as string,
              silence_duration as string,
              context
            )
          : await recordAudioFixed(duration as number, context);
        
        // Transcribe
        const transcription = await transcribeAudio(
          audioBuffer, 
          finalApiKey as string, 
          language as string,
          context
        );
        
        return {
          success: true,
          output: transcription,
          data: {
            transcription,
            language,
            promptSpoken: speak_prompt && !!prompt
          }
        };
      }
      
      // Regular recording mode
      if (prompt && speak_prompt && context.registry) {
        await speakText(prompt, context, finalApiKey as string);
      } else if (prompt && !speak_prompt) {
        context.logger?.info(`📝 ${prompt}`);
      }
      
      // Record audio
      const audioBuffer = auto_detect_silence 
        ? await recordAudioWithSilenceDetection(
            duration as number,
            min_duration as number,
            silence_threshold as string,
            silence_duration as string,
            context
          )
        : await recordAudioFixed(duration as number, context);
      
      // Transcribe audio
      const transcription = await transcribeAudio(
        audioBuffer, 
        finalApiKey as string, 
        language as string,
        context
      );
      
      // If voice mode is enabled and this is part of a larger context,
      // the response from Clanker should be spoken via TTS
      // This would be handled by a hook or the calling context
      
      return {
        success: true,
        output: transcription,
        data: {
          transcription,
          language,
          voiceModeEnabled,
          autoDetectedSilence: auto_detect_silence
        }
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  })
  .build();