import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regex matching common UI emojis (emoticons, pictographs, transport, misc symbols, dingbats)
// Does NOT match standard currency symbols like ₦ (\u20A6), bullet points • (\u2022), dashes —, or typographic quotes.
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walkDir(fullPath, fileList);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe('UI Emoji Absence Policy', () => {
  it('should not contain UI emojis in src/ components, pages, and templates', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const allFiles = walkDir(srcDir);
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((lineText, index) => {
        // Skip comment lines if they explicitly mention emoji in code explanation
        if (EMOJI_REGEX.test(lineText)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            text: lineText.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      console.log('Detected UI emojis in the following locations:');
      violations.forEach((v) => console.log(`  ${v.file}:${v.line} -> ${v.text}`));
    }

    expect(violations).toEqual([]);
  });
});
