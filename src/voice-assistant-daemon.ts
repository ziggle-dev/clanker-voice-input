/**
 * Voice Assistant Daemon - Always-on background listener
 */

import record from 'node-record-lpcm16';
import { Transform } from 'stream';
import { EventEmitter } from 'events';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { callClankerAPI } from './index.js';

const execAsync = promisify(exec);

export interface VoiceAssistantSettings {
  enabled: boolean;
  wakeWords: string[];
  userTitle: string;
  sensitivity: number;
  autoStart: boolean;
  notificationsEnabled: boolean;
  language: string;
}

export const defaultAssistantSettings: VoiceAssistantSettings = {
  enabled: false,
  wakeWords: ['hey jarvis', 'hey clanker'],
  userTitle: 'sir',
  sensitivity: 0.5,
  autoStart: true,
  notificationsEnabled: true,
  language: 'en-US'
};

export class VoiceAssistantDaemon extends EventEmitter {
  private settings: VoiceAssistantSettings;
  private recording: any = null;
  private isListening: boolean = false;
  private isProcessing: boolean = false;
  private audioBuffer: Buffer[] = [];
  private silenceTimeout: NodeJS.Timeout | null = null;
  private wakeWordDetected: boolean = false;
  private daemonProcess: any = null;

  constructor(settings: VoiceAssistantSettings) {
    super();
    this.settings = settings;
  }

  static async isRunning(): Promise<boolean> {
    try {
      const pidFile = path.join(os.homedir(), '.clanker', 'voice-assistant.pid');
      const pid = await fs.readFile(pidFile, 'utf-8');
      
      // Check if process is running
      await execAsync(`kill -0 ${pid}`);
      return true;
    } catch {
      return false;
    }
  }

  async startDaemon(): Promise<void> {
    if (await VoiceAssistantDaemon.isRunning()) {
      console.log('Voice assistant daemon already running');
      return;
    }

    // Fork a child process to run the daemon
    const daemonScript = path.join(__dirname, 'daemon-runner.js');
    this.daemonProcess = spawn('node', [daemonScript], {
      detached: true,
      stdio: 'ignore'
    });

    // Save PID
    const pidFile = path.join(os.homedir(), '.clanker', 'voice-assistant.pid');
    await fs.writeFile(pidFile, this.daemonProcess.pid.toString());

    this.daemonProcess.unref();
    console.log(`Voice assistant daemon started (PID: ${this.daemonProcess.pid})`);
  }

  async stopDaemon(): Promise<void> {
    try {
      const pidFile = path.join(os.homedir(), '.clanker', 'voice-assistant.pid');
      const pid = await fs.readFile(pidFile, 'utf-8');
      
      // Kill the process
      await execAsync(`kill ${pid}`);
      await fs.unlink(pidFile);
      
      console.log('Voice assistant daemon stopped');
    } catch (error) {
      console.error('Failed to stop daemon:', error);
    }
  }

  async startListening(): Promise<void> {
    if (this.isListening) return;

    this.isListening = true;
    this.emit('listening-started');

    // Start continuous recording
    this.recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      recorder: 'sox',
      silence: '1.0',
      threshold: '2%',
      keepSilence: true
    });

    const audioStream = this.recording.stream();
    const wakeWordDetector = this.createWakeWordDetector();

    audioStream.pipe(wakeWordDetector);

    audioStream.on('error', (err: Error) => {
      console.error('Recording error:', err.message);
      this.emit('error', err);
    });
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    this.isListening = false;
    
    if (this.recording) {
      this.recording.stop();
      this.recording = null;
    }

    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }

    this.emit('listening-stopped');
  }

  private createWakeWordDetector(): Transform {
    const CHUNK_DURATION = 3000; // 3 seconds
    const SAMPLE_RATE = 16000;
    const BYTES_PER_SAMPLE = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * (CHUNK_DURATION / 1000);

    let buffer = Buffer.alloc(0);

    return new Transform({
      transform: async (chunk: Buffer, encoding, callback) => {
        if (!this.isListening) {
          callback();
          return;
        }

        buffer = Buffer.concat([buffer, chunk]);

        // Process in 3-second chunks
        while (buffer.length >= CHUNK_SIZE) {
          const audioChunk = buffer.slice(0, CHUNK_SIZE);
          buffer = buffer.slice(CHUNK_SIZE);

          if (!this.wakeWordDetected && !this.isProcessing) {
            // Check for wake word
            const detected = await this.detectWakeWord(audioChunk);
            if (detected) {
              this.onWakeWordDetected();
            }
          } else if (this.wakeWordDetected) {
            // Collect command audio
            this.audioBuffer.push(audioChunk);
            this.resetSilenceTimeout();
          }
        }

        callback();
      }
    });
  }

  private async detectWakeWord(audioBuffer: Buffer): Promise<boolean> {
    try {
      const transcription = await callClankerAPI(audioBuffer, this.settings.language);
      const lowerText = transcription.toLowerCase();

      return this.settings.wakeWords.some(wakeWord => 
        lowerText.includes(wakeWord.toLowerCase())
      );
    } catch {
      return false;
    }
  }

  private onWakeWordDetected(): void {
    this.wakeWordDetected = true;
    this.audioBuffer = [];
    this.emit('wake-word-detected');
    
    if (this.settings.notificationsEnabled) {
      this.showNotification('Listening...', `Yes, ${this.settings.userTitle}?`);
    }
    
    // Start silence timeout
    this.resetSilenceTimeout();
  }

  private resetSilenceTimeout(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }

    this.silenceTimeout = setTimeout(() => {
      this.onSilenceDetected();
    }, 2000); // 2 seconds of silence
  }

  private async onSilenceDetected(): Promise<void> {
    if (!this.wakeWordDetected || this.audioBuffer.length === 0) {
      this.wakeWordDetected = false;
      return;
    }

    this.isProcessing = true;
    this.emit('processing-command');

    try {
      // Combine audio buffers
      const fullAudio = Buffer.concat(this.audioBuffer);
      
      // Transcribe the command
      const command = await callClankerAPI(fullAudio, this.settings.language);
      
      this.emit('command-recognized', command);

      // Execute command via Clanker
      await this.executeCommand(command);
    } catch (error: any) {
      console.error('Command processing error:', error.message);
      this.emit('error', error);
    } finally {
      this.wakeWordDetected = false;
      this.isProcessing = false;
      this.audioBuffer = [];
    }
  }

  private async executeCommand(command: string): Promise<void> {
    try {
      // Execute command via Clanker CLI
      const { stdout, stderr } = await execAsync(`clanker -p "${command}" -y`);
      
      if (stdout) {
        this.emit('command-executed', { command, output: stdout });
      }
      
      if (stderr) {
        this.emit('command-error', { command, error: stderr });
      }
    } catch (error: any) {
      this.emit('command-error', { command, error: error.message });
    }
  }

  private async showNotification(title: string, message: string): Promise<void> {
    try {
      const notifier = (await import('node-notifier')).default;
      notifier.notify({
        title,
        message,
        sound: true,
        wait: false
      });
    } catch {
      // Fallback to console if notifier not available
      console.log(`[${title}] ${message}`);
    }
  }

  // Method for AI to ask user something
  async askUser(question: string): Promise<void> {
    const message = `${this.settings.userTitle}, ${question}`;
    await this.showNotification('Clanker Assistant', message);
    
    // Also speak if TTS is available
    try {
      await execAsync(`say "${message}"`);
    } catch {
      // Ignore if say command not available
    }
  }
}