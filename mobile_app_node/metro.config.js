// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure expo-router works properly
config.resolver.sourceExts.push('mjs');

// Configure Metro to handle react-native-screens properly
config.resolver.unstable_enablePackageExports = true;

// Prioritize app's node_modules over root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

// Note: Custom resolver removed due to "property is not writable" error
// The default Metro resolver should handle the fabric imports
// If issues persist, we may need to patch react-native-screens directly

// Configure transformer to skip prop type validation for node_modules
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
  // Skip prop type validation in node_modules
  unstable_allowRequireContext: true,
};

// Remove blocklist - we need the fabric files to be resolved
// The issue was that we were blocking the file, but we actually need it

module.exports = config;

