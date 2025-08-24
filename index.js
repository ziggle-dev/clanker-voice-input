// ../tool-repo/src/index.ts

// src/index.ts
import { createTool, ToolCategory, ToolCapability } from "@ziggler/clanker";
import record2 from "node-record-lpcm16";
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
import * as fs2 from "fs/promises";
import * as path2 from "path";
import * as os2 from "os";

// src/voice-assistant-daemon.ts
import record from "node-record-lpcm16";
import { Transform } from "stream";
import { EventEmitter } from "events";
import { exec } from "child_process";
import { promisify } from "util";

// src/elevenlabs.ts
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
async function loadClankerSettings() {
  const settingsPath = path.join(os.homedir(), ".clanker", "settings.json");
  try {
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
async function getElevenLabsApiKey(context) {
  if (context) {
    const contextWithSharedState = context;
    if (contextWithSharedState.sharedState) {
      const elevenLabsKey = contextWithSharedState.sharedState.get("elevenlabs:apiKey");
      if (elevenLabsKey && typeof elevenLabsKey === "string") {
        return elevenLabsKey;
      }
    }
  }
  const settings = await loadClankerSettings();
  return settings.elevenLabsApiKey;
}
async function transcribeWithElevenLabs(audioBuffer, language, prompt, context) {
  const apiKey = await getElevenLabsApiKey(context);
  if (!apiKey) {
    throw new Error("ElevenLabs API key not found. Please configure it in ~/.clanker/settings.json");
  }
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "audio.wav",
    contentType: "audio/wav"
  });
  form.append("model_id", "scribe_v1");
  form.append("language_code", language.split("-")[0]);
  if (prompt) {
    form.append("prompt", prompt);
  }
  const fetch = (await import("node-fetch")).default;
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      ...form.getHeaders()
    },
    body: form
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs STT error: ${response.status} - ${error}`);
  }
  const result = await response.json();
  return result.text;
}

// src/voice-assistant-daemon.ts
var execAsync = promisify(exec);
var defaultAssistantSettings = {
  enabled: true,
  // Enabled when tool is installed
  wakeWords: ["hey clanker", "hey jarvis", "clanker"],
  userTitle: "sir",
  sensitivity: 0.5,
  autoStart: true,
  // Auto-start service when Clanker runs
  notificationsEnabled: true,
  language: "en-US",
  microphoneDevice: void 0,
  continuousMode: true,
  wakeWordTimeout: 3e3
};
var globalVoiceAssistant = null;
var VoiceAssistantService = class _VoiceAssistantService extends EventEmitter {
  constructor(settings) {
    super();
    this.recording = null;
    this.isListening = false;
    this.isProcessing = false;
    this.audioBuffer = [];
    this.silenceTimeout = null;
    this.wakeWordDetected = false;
    this.daemonProcess = null;
    this.settings = settings;
  }
  static getInstance(settings) {
    if (!globalVoiceAssistant) {
      globalVoiceAssistant = new _VoiceAssistantService(settings);
    }
    return globalVoiceAssistant;
  }
  static isRunning() {
    return globalVoiceAssistant !== null && globalVoiceAssistant.isListening;
  }
  async startBackgroundListener() {
    if (this.isListening) {
      return;
    }
    this.startListening().catch((error) => {
      console.error("Voice assistant background listener error:", error);
    });
  }
  async stop() {
    await this.stopListening();
  }
  async startListening() {
    if (this.isListening) return;
    this.isListening = true;
    this.emit("listening-started");
    const recordOptions = {
      sampleRate: 16e3,
      channels: 1,
      audioType: "wav",
      recorder: "sox",
      silence: "1.0",
      threshold: "2%",
      keepSilence: true
    };
    if (this.settings.microphoneDevice) {
      recordOptions.device = this.settings.microphoneDevice;
    }
    this.recording = record.record(recordOptions);
    const audioStream = this.recording.stream();
    const wakeWordDetector = this.createWakeWordDetector();
    audioStream.pipe(wakeWordDetector);
    audioStream.on("error", (err) => {
      console.error("Recording error:", err.message);
      this.emit("error", err);
    });
  }
  async stopListening() {
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
    this.emit("listening-stopped");
  }
  createWakeWordDetector() {
    const CHUNK_DURATION = 2e3;
    const SAMPLE_RATE = 16e3;
    const BYTES_PER_SAMPLE = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * (CHUNK_DURATION / 1e3);
    const MAX_BUFFER_SIZE = CHUNK_SIZE * 3;
    let buffer = Buffer.alloc(0);
    return new Transform({
      transform: async (chunk, encoding, callback) => {
        if (!this.isListening) {
          callback();
          return;
        }
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > MAX_BUFFER_SIZE) {
          buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
        }
        while (buffer.length >= CHUNK_SIZE) {
          const audioChunk = buffer.slice(0, CHUNK_SIZE);
          buffer = buffer.slice(CHUNK_SIZE);
          if (!this.wakeWordDetected && !this.isProcessing) {
            const detected = await this.detectWakeWord(audioChunk);
            if (detected) {
              this.onWakeWordDetected();
            }
          } else if (this.wakeWordDetected) {
            this.audioBuffer.push(audioChunk);
            this.resetSilenceTimeout();
          }
        }
        callback();
      }
    });
  }
  async detectWakeWord(audioBuffer) {
    try {
      const transcription = await transcribeWithElevenLabs(audioBuffer, this.settings.language);
      const lowerText = transcription.toLowerCase().trim();
      return this.settings.wakeWords.some((wakeWord) => {
        const wakeWordLower = wakeWord.toLowerCase();
        const cleanText = lowerText.replace(/[.,!?]/g, "").replace(/\s+/g, " ");
        const cleanWakeWord = wakeWordLower.replace(/\s+/g, " ");
        if (cleanText.includes(cleanWakeWord)) return true;
        if (cleanText.startsWith(cleanWakeWord)) return true;
        if (this.isSimilarPhrase(cleanText, cleanWakeWord)) return true;
        return false;
      });
    } catch (error) {
      if (process.env.DEBUG) {
        console.error("Wake word detection error:", error);
      }
      return false;
    }
  }
  isSimilarPhrase(text, target) {
    const clankerVariations = ["flanker", "clank her", "clanger", "clencher", "clinker"];
    for (const variation of clankerVariations) {
      const altTarget = target.replace("clanker", variation);
      if (text.includes(altTarget)) return true;
    }
    return false;
  }
  onWakeWordDetected() {
    this.wakeWordDetected = true;
    this.audioBuffer = [];
    this.emit("wake-word-detected");
    if (this.settings.notificationsEnabled) {
      this.showNotification("Listening...", `Yes, ${this.settings.userTitle}?`);
    }
    this.resetSilenceTimeout();
  }
  resetSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    this.silenceTimeout = setTimeout(() => {
      this.onSilenceDetected();
    }, this.settings.wakeWordTimeout || 3e3);
  }
  async onSilenceDetected() {
    if (!this.wakeWordDetected || this.audioBuffer.length === 0) {
      this.wakeWordDetected = false;
      return;
    }
    this.isProcessing = true;
    this.emit("processing-command");
    try {
      const fullAudio = Buffer.concat(this.audioBuffer);
      const command = await transcribeWithElevenLabs(fullAudio, this.settings.language);
      const cleanCommand = command.toLowerCase().trim();
      const isJustWakeWord = this.settings.wakeWords.some(
        (ww) => cleanCommand === ww.toLowerCase() || cleanCommand === ww.toLowerCase() + "." || cleanCommand === ww.toLowerCase() + "..."
      );
      if (!isJustWakeWord && command.trim().length > 0) {
        this.emit("command-recognized", command);
        await this.executeCommand(command);
      } else {
        this.emit("wake-word-only");
      }
    } catch (error) {
      console.error("Command processing error:", error.message);
      this.emit("error", error);
    } finally {
      this.wakeWordDetected = false;
      this.isProcessing = false;
      this.audioBuffer = [];
    }
  }
  async executeCommand(command) {
    try {
      const { stdout, stderr } = await execAsync(`clanker -p "${command}" -y`);
      if (stdout) {
        this.emit("command-executed", { command, output: stdout });
      }
      if (stderr) {
        this.emit("command-error", { command, error: stderr });
      }
    } catch (error) {
      this.emit("command-error", { command, error: error.message });
    }
  }
  async showNotification(title, message) {
    try {
      const notifier = (await import("node-notifier")).default;
      notifier.notify({
        title,
        message,
        sound: true,
        wait: false
      });
    } catch {
      console.log(`[${title}] ${message}`);
    }
  }
  // Method for AI to ask user something
  async askUser(question) {
    const message = `${this.settings.userTitle}, ${question}`;
    await this.showNotification("Clanker Assistant", message);
    try {
      await execAsync(`say "${message}"`);
    } catch {
    }
  }
};

// src/index.ts
var execAsync2 = promisify2(exec2);
async function loadClankerSettings2() {
  const settingsPath = path2.join(os2.homedir(), ".clanker", "settings.json");
  try {
    const content = await fs2.readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
async function checkSoxInstalled() {
  try {
    await execAsync2("which sox");
  } catch {
    throw new Error("SoX is required for audio recording. Please install it:\n  macOS: brew install sox\n  Linux: sudo apt-get install sox\n  Windows: choco install sox (or download from http://sox.sourceforge.net)");
  }
}
async function getAvailableMicrophoneDevices() {
  try {
    const { stdout } = await execAsync2('sox -n -t coreaudio -d -q 2>&1 | grep "Core Audio" || true');
    if (!stdout) {
      if (process.platform === "darwin") {
        const { stdout: macDevices } = await execAsync2('system_profiler SPAudioDataType | grep "Input Device" || true');
        if (macDevices) {
          return macDevices.split("\n").filter((line) => line.trim()).map((line) => line.trim());
        }
      } else if (process.platform === "linux") {
        const { stdout: linuxDevices } = await execAsync2('arecord -l 2>/dev/null | grep "card" || true');
        if (linuxDevices) {
          return linuxDevices.split("\n").filter((line) => line.trim());
        }
      }
    }
    return ["default"];
  } catch {
    return ["default"];
  }
}
async function recordVoice(duration, language, prompt, context) {
  const tempDir = await fs2.mkdtemp(path2.join(os2.tmpdir(), "voice-input-"));
  const audioFile = path2.join(tempDir, "recording.wav");
  return new Promise((resolve, reject) => {
    const recording = record2.record({
      sampleRate: 16e3,
      channels: 1,
      audioType: "wav",
      recorder: "sox",
      silence: "1.0",
      threshold: "2%",
      thresholdStart: null,
      thresholdEnd: null,
      keepSilence: true
    });
    const audioStream = recording.stream();
    const chunks = [];
    audioStream.on("data", (chunk) => {
      chunks.push(chunk);
    });
    audioStream.on("error", (err) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });
    setTimeout(() => {
      recording.stop();
    }, duration * 1e3);
    audioStream.on("end", async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        await fs2.writeFile(audioFile, audioBuffer);
        context?.logger?.info("Recording complete. Processing with ElevenLabs Scribe API...");
        const transcription = await transcribeWithElevenLabs(audioBuffer, language, prompt, context);
        await fs2.rm(tempDir, { recursive: true, force: true });
        resolve(transcription);
      } catch (error) {
        await fs2.rm(tempDir, { recursive: true, force: true }).catch(() => {
        });
        reject(new Error(`Transcription error: ${error.message}`));
      }
    });
  });
}
async function getTextInput(prompt, context) {
  if (!context?.registry) {
    throw new Error("Text input mode requires tool registry context");
  }
  try {
    const result = await context.registry.execute("input", {
      prompt: prompt || "Please enter your input:",
      type: "text"
    });
    if (result.success && result.output) {
      return result.output;
    } else {
      throw new Error(result.error || "Failed to get input");
    }
  } catch (error) {
    throw new Error(`Text input error: ${error.message}`);
  }
}
var daemonStarted = false;
async function ensureAssistantStarted(context) {
  if (daemonStarted) return;
  try {
    const settings = await loadClankerSettings2();
    const assistantSettings = {
      ...defaultAssistantSettings,
      ...settings.voiceAssistant
    };
    if (assistantSettings.enabled && assistantSettings.autoStart) {
      if (!VoiceAssistantService.isRunning()) {
        const service = VoiceAssistantService.getInstance(assistantSettings);
        await service.startBackgroundListener();
        context.logger?.info("Voice assistant background listener started");
        daemonStarted = true;
      } else {
        context.logger?.debug("Voice assistant already running");
        daemonStarted = true;
      }
    }
  } catch (error) {
    context.logger?.debug("Failed to start voice assistant daemon:", error);
    daemonStarted = true;
  }
}
var voiceInputTool = createTool().id("voice_input").name("Voice Input").description("Flexible input tool supporting both voice (microphone + speech-to-text) and text (system dialogs) modes. Voice mode records audio and transcribes it using ElevenLabs Scribe API. Text mode uses system dialogs. Configurable via ~/.clanker/settings.json.").category(ToolCategory.Utility).capabilities(ToolCapability.SystemExecute, ToolCapability.NetworkAccess).tags("voice", "input", "audio", "speech", "microphone", "text", "dialog", "transcription", "jarvis", "assistant").numberArg("duration", "Recording duration in seconds for voice mode (max: 30)", {
  required: false,
  default: 5
}).stringArg("language", "Language code for speech recognition (e.g., en-US, es-ES)", {
  required: false,
  default: "en-US"
}).stringArg("prompt", "Optional prompt to guide input (for both voice and text modes)", {
  required: false
}).stringArg("mode", "Input mode: voice, text, or auto (uses configured default)", {
  required: false,
  default: "auto",
  enum: ["voice", "text", "auto"]
}).booleanArg("continuous", "Enable continuous listening mode (voice only)", {
  required: false,
  default: false
}).examples([
  {
    description: "Get voice input with default settings",
    arguments: {
      mode: "voice"
    },
    result: "Records 5 seconds of audio and returns transcription"
  },
  {
    description: "Get text input with custom prompt",
    arguments: {
      mode: "text",
      prompt: "What is your name?"
    },
    result: "Shows dialog and returns user input"
  },
  {
    description: "Voice input in Spanish for 10 seconds",
    arguments: {
      mode: "voice",
      language: "es-ES",
      duration: 10,
      prompt: "Habla en espa\xF1ol"
    },
    result: "Records and transcribes Spanish speech"
  },
  {
    description: "Continuous voice mode",
    arguments: {
      mode: "voice",
      continuous: true
    },
    result: "Continuous recording sessions until stopped"
  },
  {
    description: "Auto mode (uses settings)",
    arguments: {
      mode: "auto"
    },
    result: "Uses configured default mode from ~/.clanker/settings.json"
  }
]).stringArg("daemon", "Control voice assistant daemon: start, stop, status, ask, devices", {
  required: false,
  enum: ["start", "stop", "status", "ask", "devices"]
}).stringArg("message", "Message for ask command", {
  required: false
}).execute(async (args, context) => {
  const { duration = 5, language = "en-US", prompt, mode = "auto", continuous = false, daemon, message } = args;
  await ensureAssistantStarted(context);
  const settings = await loadClankerSettings2();
  const assistantSettings = {
    ...defaultAssistantSettings,
    ...settings.voiceAssistant
  };
  if (daemon) {
    const service = VoiceAssistantService.getInstance(assistantSettings);
    switch (daemon) {
      case "start":
        await service.startBackgroundListener();
        return {
          success: true,
          output: "Voice assistant background listener started"
        };
      case "stop":
        await service.stop();
        return {
          success: true,
          output: "Voice assistant stopped"
        };
      case "status":
        const isRunning = VoiceAssistantService.isRunning();
        return {
          success: true,
          output: isRunning ? "Voice assistant is running" : "Voice assistant is not running",
          data: { running: isRunning }
        };
      case "ask":
        if (!message) {
          return {
            success: false,
            error: "Message required for ask command"
          };
        }
        await service.askUser(message);
        return {
          success: true,
          output: `Asked user: ${message}`
        };
      case "devices":
        try {
          const devices = await getAvailableMicrophoneDevices();
          return {
            success: true,
            output: devices.length > 0 ? `Available microphone devices:
${devices.join("\n")}` : "No microphone devices found",
            data: { devices }
          };
        } catch (error) {
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
  const inputConfig = settings.input || { mode: "voice" };
  let inputMode = "voice";
  if (mode === "auto") {
    inputMode = inputConfig.mode || "voice";
  } else if (mode === "voice" || mode === "text") {
    inputMode = mode;
  } else {
    return {
      success: false,
      error: `Invalid mode: ${mode}. Use 'voice', 'text', or 'auto'.`
    };
  }
  const voiceDuration = mode === "auto" && inputConfig.voiceSettings?.duration ? Math.min(inputConfig.voiceSettings.duration, 30) : Math.min(duration, 30);
  const voiceLanguage = mode === "auto" && inputConfig.voiceSettings?.language ? inputConfig.voiceSettings.language : language;
  context.logger?.info(`Using ${inputMode} input mode`);
  if (inputMode === "text") {
    if (continuous) {
      return {
        success: false,
        error: "Continuous mode is not supported for text input."
      };
    }
    try {
      const text = await getTextInput(prompt, context);
      return {
        success: true,
        output: text,
        data: {
          mode: "text",
          input: text
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  try {
    await checkSoxInstalled();
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
  if (continuous) {
    context.logger?.info("Continuous voice listening mode enabled. Use Ctrl+C to stop.");
    const results = [];
    context.logger?.warn("Note: Continuous mode in tool context performs single recording");
    try {
      context.logger?.info(`Starting voice recording for ${voiceDuration} seconds...`);
      context.logger?.info("Speak now...");
      const text = await recordVoice(voiceDuration, voiceLanguage, prompt, context);
      results.push(text);
      return {
        success: true,
        output: text,
        data: {
          mode: "continuous-voice",
          transcriptions: results,
          count: results.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  } else {
    try {
      context.logger?.info(`Starting voice recording for ${voiceDuration} seconds...`);
      context.logger?.info("Speak now...");
      const text = await recordVoice(voiceDuration, voiceLanguage, prompt, context);
      return {
        success: true,
        output: text,
        data: {
          mode: "voice",
          transcription: text,
          duration: voiceDuration,
          language: voiceLanguage
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}).build();
var index_default = voiceInputTool;
export {
  index_default as default
};
