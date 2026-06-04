declare module 'node:test' {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}

declare module 'node:assert/strict' {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };
  export default assert;
}

declare class Buffer extends Uint8Array {
  static from(input: string | ArrayBuffer | Uint8Array, encoding?: string): Buffer;
  static byteLength(input: string): number;
  toString(encoding?: string): string;
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string): Promise<Buffer>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function unlink(path: string): Promise<void>;
  export function writeFile(path: string, data: string | Buffer): Promise<void>;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string | Buffer): { digest(encoding: 'hex'): string };
    digest(encoding: 'hex'): string;
  };
  export function randomUUID(): string;
}

declare module 'node:child_process' {
  export function spawn(command: string, args?: string[], options?: {
    detached?: boolean;
    stdio?: 'ignore';
  }): {
    unref(): void;
  };
}

declare module 'node:http' {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string | number): this;
    end(data?: string | Buffer): void;
  }
}

declare const __dirname: string;
declare const process: {
  argv: string[];
  exitCode?: number;
  platform: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';
};
