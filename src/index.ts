/**
 * Voice Input tool - Flexible input abstraction supporting voice and text modes
 * 
 * This tool provides a unified interface for getting user input through either:
 * - Voice: Records audio from microphone and transcribes using Clanker's API
 * - Text: Uses system dialogs via the input tool
 * 
 * Configurable via ~/.clanker/settings.json
 */

import { createTool, ToolCategory, ToolCapability, ToolContext, ToolArguments } from '@ziggler/clanker';
import record from 'node-record-lpcm16';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { VoiceAssistantDaemon, VoiceAssistantSettings, defaultAssistantSettings } from './voice-assistant-daemon.js';

const execAsync = promisify(exec);

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
  elevenLabsApiKey?: string;
  voiceAssistant?: VoiceAssistantSettings;
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

async function getAvailableMicrophoneDevices(): Promise<string[]> {
  try {
    // Try to get available recording devices using SoX
    const { stdout } = await execAsync('sox -n -t coreaudio -d -q 2>&1 | grep "Core Audio" || true');
    
    // If that doesn't work, try platform-specific commands
    if (!stdout) {
      if (process.platform === 'darwin') {
        // macOS: Use system_profiler
        const { stdout: macDevices } = await execAsync('system_profiler SPAudioDataType | grep "Input Device" || true');
        if (macDevices) {
          return macDevices.split('\n').filter(line => line.trim()).map(line => line.trim());
        }
      } else if (process.platform === 'linux') {
        // Linux: Use arecord
        const { stdout: linuxDevices } = await execAsync('arecord -l 2>/dev/null | grep "card" || true');
        if (linuxDevices) {
          return linuxDevices.split('\n').filter(line => line.trim());
        }
      }
    }
    
    return ['default'];
  } catch {
    return ['default'];
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

async function recordVoice(duration: number, language: string, prompt?: string, context?: ToolContext): Promise<string> {
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
        
        context?.logger?.info('Recording complete. Processing with ElevenLabs Scribe API...');

        // Use ElevenLabs Scribe API for transcription
        const transcription = await transcribeWithElevenLabs(audioBuffer, language, prompt, context);

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

async function getTextInput(prompt?: string, context?: ToolContext): Promise<string> {
  if (!context?.registry) {
    throw new Error('Text input mode requires tool registry context');
  }

  try {
    const result = await context.registry.execute('input', {
      prompt: prompt || 'Please enter your input:',
      type: 'text'
    });

    if (result.success && result.output) {
      return result.output;
    } else {
      throw new Error(result.error || 'Failed to get input');
    }
  } catch (error: any) {
    throw new Error(`Text input error: ${error.message}`);
  }
}

/**
 * Voice Input tool - Flexible input abstraction for voice and text
 */
// Store daemon state globally
let daemonStarted = false;

const voiceInputTool = createTool()
  .id('voice_input')
  .name('Voice Input')
  .description('Flexible input tool supporting both voice (microphone + speech-to-text) and text (system dialogs) modes. Voice mode records audio and transcribes it using ElevenLabs Scribe API. Text mode uses system dialogs. Configurable via ~/.clanker/settings.json.')
  .category(ToolCategory.Utility)
  .capabilities(ToolCapability.SystemExecute, ToolCapability.NetworkAccess)
  .tags('voice', 'input', 'audio', 'speech', 'microphone', 'text', 'dialog', 'transcription', 'jarvis', 'assistant')

  // Arguments
  .numberArg('duration', 'Recording duration in seconds for voice mode (max: 30)', {
    required: false,
    default: 5
  })
  .stringArg('language', 'Language code for speech recognition (e.g., en-US, es-ES)', {
    required: false,
    default: 'en-US'
  })
  .stringArg('prompt', 'Optional prompt to guide input (for both voice and text modes)', {
    required: false
  })
  .stringArg('mode', 'Input mode: voice, text, or auto (uses configured default)', {
    required: false,
    default: 'auto',
    enum: ['voice', 'text', 'auto']
  })
  .booleanArg('continuous', 'Enable continuous listening mode (voice only)', {
    required: false,
    default: false
  })

  // Examples
  .examples([
    {
      description: 'Get voice input with default settings',
      arguments: {
        mode: 'voice'
      },
      result: 'Records 5 seconds of audio and returns transcription'
    },
    {
      description: 'Get text input with custom prompt',
      arguments: {
        mode: 'text',
        prompt: 'What is your name?'
      },
      result: 'Shows dialog and returns user input'
    },
    {
      description: 'Voice input in Spanish for 10 seconds',
      arguments: {
        mode: 'voice',
        language: 'es-ES',
        duration: 10,
        prompt: 'Habla en español'
      },
      result: 'Records and transcribes Spanish speech'
    },
    {
      description: 'Continuous voice mode',
      arguments: {
        mode: 'voice',
        continuous: true
      },
      result: 'Continuous recording sessions until stopped'
    },
    {
      description: 'Auto mode (uses settings)',
      arguments: {
        mode: 'auto'
      },
      result: 'Uses configured default mode from ~/.clanker/settings.json'
    }
  ])

  // Add daemon control commands
  .stringArg('daemon', 'Control voice assistant daemon: start, stop, status, ask, devices', {
    required: false,
    enum: ['start', 'stop', 'status', 'ask', 'devices']
  })
  .stringArg('message', 'Message for ask command', {
    required: false
  })

  // Execute
  .execute(async (args: ToolArguments, context: ToolContext) => {
    const { duration = 5, language = 'en-US', prompt, mode = 'auto', continuous = false, daemon, message } = args;

    // Load settings once at the beginning
    const settings = await loadClankerSettings();
    const assistantSettings = {
      ...defaultAssistantSettings,
      ...settings.voiceAssistant
    };

    // Auto-start daemon only if explicitly running daemon commands
    // Never auto-start on regular tool invocation to avoid interfering with clanker
    // User must explicitly use "voice-input daemon start" to enable always-on mode

    // Handle daemon control commands
    if (daemon) {
      const daemonInstance = new VoiceAssistantDaemon(assistantSettings);

      switch (daemon) {
        case 'start':
          await daemonInstance.startDaemon();
          return {
            success: true,
            output: 'Voice assistant daemon started'
          };

        case 'stop':
          await daemonInstance.stopDaemon();
          return {
            success: true,
            output: 'Voice assistant daemon stopped'
          };

        case 'status':
          const isRunning = await VoiceAssistantDaemon.isRunning();
          return {
            success: true,
            output: isRunning ? 'Voice assistant daemon is running' : 'Voice assistant daemon is not running',
            data: { running: isRunning }
          };

        case 'ask':
          if (!message) {
            return {
              success: false,
              error: 'Message required for ask command'
            };
          }
          await daemonInstance.askUser(message as string);
          return {
            success: true,
            output: `Asked user: ${message}`
          };

        case 'devices':
          try {
            const devices = await getAvailableMicrophoneDevices();
            return {
              success: true,
              output: devices.length > 0 ? `Available microphone devices:\n${devices.join('\n')}` : 'No microphone devices found',
              data: { devices }
            };
          } catch (error: any) {
            return {
              success: false,
              error: `Failed to list devices: ${error.message}`
            };
          }

        default:
          return {
            success: false,
            error: `Unknown daemon command: ${daemon}`
          };
      }
    }

    // Use settings loaded at the beginning
    const inputConfig = settings.input || { mode: 'voice' };

    // Determine input mode
    let inputMode: 'voice' | 'text' = 'voice';
    if (mode === 'auto') {
      inputMode = inputConfig.mode || 'voice';
    } else if (mode === 'voice' || mode === 'text') {
      inputMode = mode;
    } else {
      return {
        success: false,
        error: `Invalid mode: ${mode}. Use 'voice', 'text', or 'auto'.`
      };
    }

    // Apply settings for voice mode
    const voiceDuration = mode === 'auto' && inputConfig.voiceSettings?.duration 
      ? Math.min(inputConfig.voiceSettings.duration, 30) 
      : Math.min(duration as number, 30);
    
    const voiceLanguage = mode === 'auto' && inputConfig.voiceSettings?.language 
      ? inputConfig.voiceSettings.language 
      : language as string;

    context.logger?.info(`Using ${inputMode} input mode`);

    // Handle text input mode
    if (inputMode === 'text') {
      if (continuous) {
        return {
          success: false,
          error: 'Continuous mode is not supported for text input.'
        };
      }

      try {
        const text = await getTextInput(prompt as string | undefined, context);
        return {
          success: true,
          output: text,
          data: {
            mode: 'text',
            input: text
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    // Voice input mode
    try {
      await checkSoxInstalled();
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }

    if (continuous) {
      context.logger?.info('Continuous voice listening mode enabled. Use Ctrl+C to stop.');
      const results: string[] = [];
      
      // Note: In a real tool context, continuous mode would need special handling
      // For now, we'll just do a single recording and note the limitation
      context.logger?.warn('Note: Continuous mode in tool context performs single recording');
      
      try {
        context.logger?.info(`Starting voice recording for ${voiceDuration} seconds...`);
        context.logger?.info('Speak now...');
        
        const text = await recordVoice(voiceDuration, voiceLanguage, prompt as string | undefined, context);
        results.push(text);
        
        return {
          success: true,
          output: text,
          data: {
            mode: 'continuous-voice',
            transcriptions: results,
            count: results.length
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    } else {
      try {
        context.logger?.info(`Starting voice recording for ${voiceDuration} seconds...`);
        context.logger?.info('Speak now...');
        
        const text = await recordVoice(voiceDuration, voiceLanguage, prompt as string | undefined, context);
        
        return {
          success: true,
          output: text,
          data: {
            mode: 'voice',
            transcription: text,
            duration: voiceDuration,
            language: voiceLanguage
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  })
  .build();

// Export the tool directly
export default voiceInputTool;