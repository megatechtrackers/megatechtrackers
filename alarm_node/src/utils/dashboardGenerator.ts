/**
 * Dashboard HTML generator for Alarm Service
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

export function getDashboardHTML(): string {
  const updateInterval = 5000; // 5 seconds
  
  // Get external service URLs from environment variables with sensible defaults
  const mockSmsUrl = process.env.MOCK_SMS_URL || 'http://localhost:8786';
  const mockEmailUrl = process.env.MOCK_EMAIL_URL || 'http://localhost:8025';
  const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3000';
  const rabbitmqManagementUrl = process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672';
  
  // Read modular files
  const sharedCSS = readFile('ui/shared/styles.css');
  const dashboardCSS = readFile('ui/dashboard/dashboard.css');
  let dashboardJS = readFile('ui/dashboard/dashboard.js');
  
  // Read the HTML template
  let html = readFile('ui/dashboard/dashboard.html');
  
  // If HTML file doesn't exist, return minimal fallback
  if (!html) {
    return `<!DOCTYPE html><html><head><title>Dashboard</title></head><body><h1>Dashboard UI - Files not found</h1></body></html>`;
  }
  
  // Replace CSS and JS links with inline content
  html = html.replace(
    '<link rel="stylesheet" href="/ui/shared/styles.css">',
    `<style>${sharedCSS}</style>`
  );
  html = html.replace(
    '<link rel="stylesheet" href="/ui/dashboard/dashboard.css">',
    `<style>${dashboardCSS}</style>`
  );
  
  // Replace UPDATE_INTERVAL placeholder in JS
  dashboardJS = dashboardJS.replace('__UPDATE_INTERVAL__', updateInterval.toString());
  
  // Replace external service URL placeholders
  html = html.replace(/__MOCK_SMS_URL__/g, mockSmsUrl);
  html = html.replace(/__MOCK_EMAIL_URL__/g, mockEmailUrl);
  html = html.replace(/__GRAFANA_URL__/g, grafanaUrl);
  html = html.replace(/__RABBITMQ_URL__/g, rabbitmqManagementUrl);
  
  html = html.replace(
    '<script src="/ui/dashboard/dashboard.js"></script>',
    `<script>${dashboardJS}</script>`
  );
  
  return html;
}
