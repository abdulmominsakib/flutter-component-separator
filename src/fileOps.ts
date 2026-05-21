import * as fs from 'fs';
import * as path from 'path';

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
}

function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content);
}

export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}

export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

export function createTempFileUri(baseDir: string, fileName: string, content: string): string {
  const tempDir = joinPath(baseDir, '.flutter-separator-temp');
  ensureDir(tempDir);
  const tempFile = joinPath(tempDir, fileName);
  writeFile(tempFile, content);
  return tempFile;
}

export function cleanupTempDir(baseDir: string): void {
  const tempDir = joinPath(baseDir, '.flutter-separator-temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
