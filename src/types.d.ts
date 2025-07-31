declare module 'node-record-lpcm16' {
  export interface RecordOptions {
    sampleRate?: number;
    channels?: number;
    audioType?: string;
    recorder?: string;
    device?: string;
    silence?: string;
    threshold?: string;
    thresholdStart?: any;
    thresholdEnd?: any;
    keepSilence?: boolean;
  }

  export interface Recording {
    stream(): NodeJS.ReadableStream;
    stop(): void;
  }

  export function record(options?: RecordOptions): Recording;
}

declare module '@ziggler/clanker' {
  export enum ToolCategory {
    Utility = 'utility'
  }

  export enum ToolCapability {
    SystemExecute = 'system:execute',
    NetworkAccess = 'network:access',
    FileSystem = 'file:system'
  }

  export interface ToolContext {
    logger?: {
      info: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
      debug: (...args: any[]) => void;
    };
    registry?: {
      execute: (toolName: string, args: any) => Promise<any>;
    };
  }

  export interface ToolArguments {
    [key: string]: any;
  }

  export interface ToolBuilder {
    id(id: string): this;
    name(name: string): this;
    description(desc: string): this;
    category(cat: ToolCategory): this;
    capabilities(...caps: ToolCapability[]): this;
    tags(...tags: string[]): this;
    booleanArg(name: string, desc: string, opts?: any): this;
    stringArg(name: string, desc: string, opts?: any): this;
    numberArg(name: string, desc: string, opts?: any): this;
    examples(examples: any[]): this;
    execute(fn: (args: ToolArguments, context: ToolContext) => Promise<any>): this;
    build(): any;
  }

  export function createTool(): ToolBuilder;
}

declare module 'electron-squirrel-startup' {
  const value: boolean;
  export = value;
}