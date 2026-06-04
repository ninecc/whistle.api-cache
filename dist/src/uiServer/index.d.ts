export default function setupUiServer(server: any, options?: Record<string, unknown>): void;
export declare function getOpenDirectoryCommand(dir: string, platform?: typeof process.platform): {
    command: string;
    args: string[];
};
