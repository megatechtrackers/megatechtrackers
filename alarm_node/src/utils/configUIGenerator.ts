/**
 * Configuration UI HTML generator for Alarm Service
 * Reads modular CSS/JS/HTML files and embeds them inline
 */

import * as fs from 'fs';
import * as path from 'path';

function readFile(filePath: string): string {
  // Try multiple paths: dist (production), src (development), or relative to project root
  // __dirname will be dist/utils when compiled, so we need to go up to find src or dist
  const baseDir = path.resolve(__dirname, '..'); // dist or src
  const projectRoot = path.resolve(baseDir, '..'); // project root
  
  const paths = [
    path.join(baseDir, filePath), // dist/ui/... or src/ui/...
    path.join(projectRoot, 'dist', filePath), // dist/ui/... (from project root)
    path.join(projectRoot, 'src', filePath), // src/ui/... (from project root)
  ];
  
  for (const fullPath of paths) {
    try {
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf-8');
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  console.error(`Error: Could not find file ${filePath}`);
  console.error(`Tried paths:`, paths);
  return '';
}

export function getConfigUIHTML(): string {
  // Read modular files
  const sharedCSS = readFile('ui/shared/styles.css');
  const configCSS = readFile('ui/config/config.css');
  const sharedJS = readFile('ui/shared/utils.js');
  const configJS = readFile('ui/config/config.js');
  
  // Read the HTML template
  let html = readFile('ui/config/config.html');
  
  // If HTML file doesn't exist, return minimal fallback
  if (!html) {
    return `<!DOCTYPE html><html><head><title>Config</title></head><body><h1>Config UI - Files not found</h1></body></html>`;
  }
  
  // Replace CSS and JS links with inline content
  html = html.replace(
    '<link rel="stylesheet" href="/ui/shared/styles.css">',
    `<style>${sharedCSS}</style>`
  );
  html = html.replace(
    '<link rel="stylesheet" href="/ui/config/config.css">',
    `<style>${configCSS}</style>`
  );
  html = html.replace(
    '<script src="/ui/shared/utils.js"></script>',
    `<script>${sharedJS}</script>`
  );
  html = html.replace(
    '<script src="/ui/config/config.js"></script>',
    `<script>${configJS}</script>`
  );
  
  return html;
}
