# React Native Mobile App

**Last Updated**: 2026-02-01

## Overview

React Native mobile application using Expo SDK 54 and React Native 0.81.5. Similar UI/UX to Next.js web app.

## Technology Stack

- **Expo SDK**: 54.0
- **React Native**: 0.81.5
- **TypeScript**: 5.9
- **Expo Router**: v6
- **React Navigation**: v7
- **WebView**: For forms and reports display

## Setup

```bash
cd mobile_app_node
npm install
```

## Configuration

Create `.env` (local dev).

For ready-made examples, see:
- `mobile_app_node/.env.example` (iOS Simulator / web)
- `mobile_app_node/env.android-emulator.example` (Android Emulator)
- `mobile_app_node/env.device.example` (physical device)

### iOS Simulator / Web (works with localhost)
```env
EXPO_PUBLIC_FRAPPE_URL=http://localhost:8000
EXPO_PUBLIC_ACCESS_GATEWAY_URL=http://localhost:3001
```

### Android Emulator (do NOT use localhost)

Android emulators can’t reach your PC via `localhost`. Use `10.0.2.2` to reach your host machine (including Docker published ports):

```env
EXPO_PUBLIC_FRAPPE_URL=http://10.0.2.2:8000
EXPO_PUBLIC_ACCESS_GATEWAY_URL=http://10.0.2.2:3001
```

### Physical device (use your PC LAN IP)

Use your PC’s LAN IP (example below):

```env
EXPO_PUBLIC_FRAPPE_URL=http://192.168.1.50:8000
EXPO_PUBLIC_ACCESS_GATEWAY_URL=http://192.168.1.50:3001
```

## Development

```bash
cd mobile_app_node

# Start Expo
npm start

# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web (for development)
npm run web
```

## Build

Common options:

```bash
# Web export (static)
npx expo export --platform web

# Native dev builds (requires Android Studio / Xcode)
npx expo run:android
npx expo run:ios
```

For production app-store builds, use EAS (optional): `npx eas build`.

## Local dev on Windows (recommended)

- Install **Node.js LTS**
- Install **Expo Go** on your phone (optional; easiest for device testing)
- For Android emulator: install **Android Studio** and create an emulator

Then:

```bash
cd mobile_app_node
npm install
npm start
```

## Notes / Troubleshooting

- **Android + localhost**: Android emulator/device cannot reach your PC via `localhost`. Use `10.0.2.2` (emulator) or your PC’s LAN IP (physical device) in `EXPO_PUBLIC_FRAPPE_URL` / `EXPO_PUBLIC_ACCESS_GATEWAY_URL`.
- **Expo Web + CORS**:
  - `access-gateway` CORS is controlled by `ALLOWED_ORIGINS`. If you use `npm run web` (default `http://localhost:19006`), add it to your repo root `.env`, then restart the container:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006
```

```bash
docker compose up -d --no-deps --force-recreate access-gateway
```

  - **Frappe** must also allow CORS for Expo web. Run once:

```bash
docker exec frappe bash -lc "cd /home/frappe/frappe-bench && bench --site site1.localhost set-config allow_cors http://localhost:19006"
```

Then restart Frappe if needed:

```bash
docker compose restart frappe
```

## Docker (optional)

Expo runs in Docker as part of the main stack:

- `.\docker-start-frappe.ps1` (Windows)
- `./docker-start-frappe.sh` (Linux/macOS)

Expo will be available at: `http://localhost:19000`

## Features

- Frappe authentication
- Forms and reports in WebView
- Native mobile UI patterns
- Similar UX to web app
- iOS and Android support
- TypeScript throughout

## Project Structure

```
mobile_app_node/
├── app/              # Expo Router pages
│   ├── (auth)/      # Authentication screens
│   │   └── login.tsx
│   └── (tabs)/      # Main app tabs
│       ├── index.tsx    # Forms tab
│       └── reports.tsx  # Reports tab
├── src/
│   ├── lib/         # API and auth
│   ├── components/  # React Native components
│   └── types/       # TypeScript types
└── package.json
```

## UI Components

- **Login Screen**: Native authentication form
- **Forms Tab**: List of assigned forms
- **Reports Tab**: List of assigned reports
- **Form/Report Viewer**: WebView display with native header

## Differences from Web App

- Uses WebView instead of iframe
- Native navigation (tabs/drawer)
- AsyncStorage instead of cookies
- Native mobile UI patterns
- Platform-specific optimizations
