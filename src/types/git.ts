export interface VirtualTextFolder {
  [filePath: string]: string;
}

export interface VirtualBinaryFolder {
  [filePath: string]: Uint8Array;
}

export interface VirtualFolder {
  [filePath: string]: string | Uint8Array;
}
