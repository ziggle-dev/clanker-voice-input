declare module 'node-record-lpcm16' {
  export interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    audioType?: string;
    recorder?: string;
    silence?: string;
    threshold?: string;
    thresholdStart?: number | null;
    thresholdEnd?: number | null;
    keepSilence?: boolean;
  }

  export interface Recording {
    stream(): NodeJS.ReadableStream;
    stop(): void;
  }

  export function record(options?: RecordOptions): Recording;
}