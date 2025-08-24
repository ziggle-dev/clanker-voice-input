// Voice Input Tool for Clanker

// src/index.ts
import { createTool, ToolCategory, ToolCapability } from "@ziggler/clanker";
import record from "node-record-lpcm16";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";
import { exec } from "child_process";
var execAsync = promisify(exec);
var settingsPath = path.join(os.homedir(), ".clanker", "settings.json");
var conversationMode = false;
var autoSpeak = false;
async function loadToolSettings() {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    const settingsData = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsData);
    return settings.tools?.elevenlabs || null;
  } catch {
    return null;
  }
}
async function saveToolSettings(toolSettings) {
  try {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    let settings = {};
    try {
      const existingData = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existingData);
    } catch {
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
    console.error("Failed to save settings:", error);
  }
}
async function getApiKey(context) {
  const settings = await loadToolSettings();
  if (settings?.apiKey) {
    return settings.apiKey;
  }
  if (context?.registry) {
    try {
      const result = await context.registry.execute("input", {
        prompt: "Please enter your ElevenLabs API key:",
        title: "ElevenLabs API Key Required",
        type: "password"
      });
      if (result.success && result.output) {
        await saveToolSettings({ apiKey: result.output });
        return result.output;
      }
    } catch (error) {
      context.logger?.error("Failed to prompt for API key:", error);
    }
  }
  return void 0;
}
async function checkSoxInstalled() {
  try {
    await execAsync("which sox");
    return true;
  } catch {
    return false;
  }
}
async function recordAudioWithSilenceDetection(maxDuration, minDuration = 1, silenceThreshold = "2%", silenceDuration = "2.0", context) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let recordingTime = 0;
    const checkInterval = 100;
    context?.logger?.info(`\u{1F534} Recording (speak now, will stop on silence)...`);
    const recording = record.record({
      sampleRate: 16e3,
      channels: 1,
      audioType: "wav",
      recorder: "sox",
      silence: silenceDuration,
      // Duration of silence before stopping
      threshold: silenceThreshold,
      // Volume threshold for silence
      thresholdStart: null,
      // Don't wait for sound to start
      thresholdEnd: silenceThreshold,
      // Stop on silence
      keepSilence: true
    });
    const stream = recording.stream();
    let hasData = false;
    stream.on("data", (chunk) => {
      chunks.push(chunk);
      if (chunk.length > 0) {
        hasData = true;
      }
    });
    stream.on("error", (err) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });
    const timeoutCheck = setInterval(() => {
      recordingTime += checkInterval;
      if (recordingTime >= maxDuration * 1e3) {
        clearInterval(timeoutCheck);
        recording.stop();
        context?.logger?.info("Maximum recording duration reached.");
      } else if (recordingTime >= minDuration * 1e3 && hasData) {
      }
    }, checkInterval);
    stream.on("end", () => {
      clearInterval(timeoutCheck);
      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length < 1e3) {
        context?.logger?.warn("Recording too short, might be just noise.");
      }
      context?.logger?.info(`Recording complete (${(recordingTime / 1e3).toFixed(1)}s).`);
      resolve(audioBuffer);
    });
    stream.on("close", () => {
      clearInterval(timeoutCheck);
      if (chunks.length > 0) {
        const audioBuffer = Buffer.concat(chunks);
        context?.logger?.info(`Recording stopped on silence detection.`);
        resolve(audioBuffer);
      }
    });
  });
}
async function recordAudioFixed(duration, context) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    context?.logger?.info(`\u{1F534} Recording for ${duration} seconds...`);
    const recording = record.record({
      sampleRate: 16e3,
      channels: 1,
      audioType: "wav",
      recorder: "sox"
    });
    const stream = recording.stream();
    stream.on("data", (chunk) => {
      chunks.push(chunk);
    });
    stream.on("error", (err) => {
      recording.stop();
      reject(new Error(`Recording error: ${err.message}`));
    });
    setTimeout(() => {
      recording.stop();
    }, duration * 1e3);
    stream.on("end", () => {
      const audioBuffer = Buffer.concat(chunks);
      context?.logger?.info("Recording complete.");
      resolve(audioBuffer);
    });
  });
}
async function transcribeAudio(audioBuffer, apiKey, language = "en", context) {
  context?.logger?.info("Transcribing with ElevenLabs Scribe...");
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "recording.wav",
    contentType: "audio/wav"
  });
  form.append("model_id", "scribe_v1");
  form.append("language_code", language);
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
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }
  const result = await response.json();
  context?.logger?.info(`\u{1F4DD} Transcription: "${result.text}"`);
  return result.text;
}
async function speakText(text, context, apiKey) {
  if (!context.registry) {
    context.logger?.warn("TTS not available - no registry context");
    return;
  }
  try {
    await context.registry.execute("elevenlabs_tts", {
      action: "speak",
      text,
      api_key: apiKey
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
  } catch (error) {
    context.logger?.warn("Failed to speak via TTS:", error);
  }
}
var index_default = createTool().id("voice_input").name("Voice Input").description("Advanced voice recording with conversation mode, intelligent silence detection, and TTS integration. Records audio from microphone and transcribes using ElevenLabs Scribe API.").category(ToolCategory.Utility).capabilities(ToolCapability.SystemExecute, ToolCapability.NetworkAccess).tags("voice", "input", "audio", "speech", "microphone", "transcription", "stt", "elevenlabs", "conversation").stringArg("action", "Action to perform: record, conversation, enable_auto_speak, disable_auto_speak, status", {
  required: false,
  default: "record",
  enum: ["record", "conversation", "enable_auto_speak", "disable_auto_speak", "status"]
}).stringArg("prompt", "Optional prompt to speak before recording", {
  required: false
}).numberArg("duration", "Max recording duration in seconds (1-60)", {
  required: false,
  default: 30
}).numberArg("min_duration", "Minimum recording duration before silence detection (1-10)", {
  required: false,
  default: 1
}).stringArg("language", "Language code for transcription (e.g., en, es, fr)", {
  required: false,
  default: "en"
}).stringArg("api_key", "ElevenLabs API key (will use saved key if not provided)", {
  required: false
}).booleanArg("speak_prompt", "If true, speaks the prompt using TTS", {
  required: false,
  default: true
  // Default to true for better UX
}).booleanArg("auto_detect_silence", "Use intelligent silence detection to stop recording", {
  required: false,
  default: true
}).booleanArg("speak_response", "Speak the AI response via TTS (for conversation mode)", {
  required: false,
  default: false
}).stringArg("silence_threshold", "Volume threshold for silence detection (e.g., 1%, 2%, 5%)", {
  required: false,
  default: "2%"
}).stringArg("silence_duration", "Duration of silence before stopping (e.g., 1.5, 2.0)", {
  required: false,
  default: "2.0"
}).examples([
  {
    description: "Simple voice recording with auto-stop",
    arguments: {
      action: "record"
    },
    result: "Records until silence detected, returns transcription"
  },
  {
    description: "Conversation mode",
    arguments: {
      action: "conversation",
      prompt: "Hello! How can I help you today?"
    },
    result: "Starts a voice conversation with TTS prompts and STT responses"
  },
  {
    description: "Fixed duration recording",
    arguments: {
      action: "record",
      duration: 5,
      auto_detect_silence: false
    },
    result: "Records exactly 5 seconds"
  },
  {
    description: "Voice question with TTS",
    arguments: {
      prompt: "What is your favorite programming language?",
      speak_prompt: true,
      speak_response: true
    },
    result: "Asks via TTS, records response, speaks back confirmation"
  },
  {
    description: "Enable auto-speak for all responses",
    arguments: {
      action: "enable_auto_speak"
    },
    result: "All AI responses will be spoken via TTS"
  },
  {
    description: "Adjust silence detection sensitivity",
    arguments: {
      action: "record",
      silence_threshold: "1%",
      silence_duration: "1.5"
    },
    result: "More sensitive silence detection, stops after 1.5s of silence"
  }
]).execute(async (args, context) => {
  const {
    action = "record",
    prompt,
    duration = 30,
    min_duration = 1,
    language = "en",
    api_key,
    speak_prompt = true,
    auto_detect_silence = true,
    speak_response = false,
    silence_threshold = "2%",
    silence_duration = "2.0"
  } = args;
  switch (action) {
    case "enable_auto_speak":
      autoSpeak = true;
      await saveToolSettings({ autoSpeak: true });
      return {
        success: true,
        output: "Auto-speak enabled. All responses will be spoken via TTS."
      };
    case "disable_auto_speak":
      autoSpeak = false;
      await saveToolSettings({ autoSpeak: false });
      return {
        success: true,
        output: "Auto-speak disabled."
      };
    case "status":
      const settings2 = await loadToolSettings();
      return {
        success: true,
        output: `Voice Input Status:
- Conversation Mode: ${conversationMode ? "Active" : "Inactive"}
- Auto-Speak: ${autoSpeak || settings2?.autoSpeak ? "Enabled" : "Disabled"}
- API Key: ${settings2?.apiKey ? "Configured" : "Not configured"}
- Default Language: ${settings2?.language || "en"}`
      };
  }
  const soxInstalled = await checkSoxInstalled();
  if (!soxInstalled) {
    return {
      success: false,
      error: "SoX is required for audio recording. Please install it:\n  macOS: brew install sox\n  Linux: sudo apt-get install sox\n  Windows: choco install sox"
    };
  }
  const finalApiKey = api_key || await getApiKey(context);
  if (!finalApiKey) {
    return {
      success: false,
      error: "ElevenLabs API key is required. Please provide it or save it in settings."
    };
  }
  const settings = await loadToolSettings();
  const shouldSpeak = speak_response || autoSpeak || settings?.autoSpeak || false;
  try {
    if (action === "conversation") {
      conversationMode = true;
      context.logger?.info('\u{1F399}\uFE0F Entering conversation mode. Say "goodbye" or "exit" to end.');
      if (prompt && context.registry) {
        await speakText(prompt, context, finalApiKey);
      }
      let continueConversation = true;
      const conversationHistory = [];
      while (continueConversation) {
        const audioBuffer2 = auto_detect_silence ? await recordAudioWithSilenceDetection(
          duration,
          min_duration,
          silence_threshold,
          silence_duration,
          context
        ) : await recordAudioFixed(duration, context);
        const transcription2 = await transcribeAudio(
          audioBuffer2,
          finalApiKey,
          language,
          context
        );
        const lowerTranscription = transcription2.toLowerCase();
        if (lowerTranscription.includes("goodbye") || lowerTranscription.includes("exit") || lowerTranscription.includes("stop")) {
          context.logger?.info("Ending conversation mode.");
          if (context.registry) {
            await speakText("Goodbye! Ending conversation mode.", context, finalApiKey);
          }
          continueConversation = false;
          break;
        }
        conversationHistory.push({ role: "user", content: transcription2 });
        const response = `I heard you say: "${transcription2}". Please continue or say goodbye to exit.`;
        conversationHistory.push({ role: "assistant", content: response });
        if (context.registry) {
          await speakText(response, context, finalApiKey);
        }
      }
      conversationMode = false;
      return {
        success: true,
        output: "Conversation ended.",
        data: {
          conversationHistory,
          duration: conversationHistory.length
        }
      };
    }
    if (prompt && speak_prompt && context.registry) {
      await speakText(prompt, context, finalApiKey);
    } else if (prompt && !speak_prompt) {
      context.logger?.info(`\u{1F4DD} ${prompt}`);
    }
    const audioBuffer = auto_detect_silence ? await recordAudioWithSilenceDetection(
      duration,
      min_duration,
      silence_threshold,
      silence_duration,
      context
    ) : await recordAudioFixed(duration, context);
    const transcription = await transcribeAudio(
      audioBuffer,
      finalApiKey,
      language,
      context
    );
    if (shouldSpeak && context.registry) {
      const confirmationMessage = `I heard: ${transcription}`;
      await speakText(confirmationMessage, context, finalApiKey);
    }
    return {
      success: true,
      output: transcription,
      data: {
        transcription,
        language,
        autoDetectedSilence: auto_detect_silence,
        spokeFeedback: shouldSpeak
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}).build();
export {
  index_default as default
};
