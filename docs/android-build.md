# Android Build Guide

This guide walks you through building an Android APK/AAB for the Megatechtrackers mobile app.

## Prerequisites

1. **Node.js and npm** - Already installed ✓
2. **Expo CLI** - Already installed ✓
3. **EAS CLI** - Install globally:
   ```bash
   npm install -g eas-cli
   ```
4. **Expo Account** - Create one at https://expo.dev if you don't have one

## Initial Setup

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Login to Expo

```bash
eas login
```

Enter your Expo account credentials.

### 3. Configure Your Project

Navigate to the Mobile App directory:

```bash
cd mobile_app_node
```

### 4. Link Your Project to EAS

```bash
eas build:configure
```

This will:
- Create an EAS project
- Generate a project ID
- Update your `app.json` with the project ID

### 5. Set Up Environment Variables

Create a `.env.production` file in `mobile_app_node/` with your production URLs:

```bash
## Production Environment Configuration
EXPO_PUBLIC_FRAPPE_URL=https://your-production-frappe-url.com
EXPO_PUBLIC_ACCESS_GATEWAY_URL=https://your-production-gateway-url.com
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id
```

**Important:** Replace the placeholder URLs with your actual production server URLs.

## Build Types

We have configured 4 build profiles in `eas.json`:

### 1. Development Build (APK)

**Purpose:** For development and testing with development tools enabled.

```bash
npm run build:android:dev
# or
eas build --platform android --profile development
```

**Output:** Debug APK with development client

### 2. Preview Build (APK)

**Purpose:** For internal testing and QA. Production-like but easier to distribute.

```bash
npm run build:android:preview
# or
eas build --platform android --profile preview
```

**Output:** Release APK (can be installed directly on devices)

### 3. Production Build (APK)

**Purpose:** For production release as APK (easier distribution outside Play Store).

```bash
npm run build:android:production
# or
eas build --platform android --profile production
```

**Output:** Production APK

### 4. Production Build (AAB)

**Purpose:** For Google Play Store submission (required by Play Store).

```bash
npm run build:android:aab
# or
eas build --platform android --profile production-aab
```

**Output:** Android App Bundle (AAB)

### 5. Local Build

**Purpose:** Build locally on your machine instead of using Expo servers.

**Requirements:**
- Android Studio installed
- Android SDK configured
- Java JDK installed

```bash
npm run build:android:local
# or
eas build --platform android --profile production --local
```

## Step-by-Step: First Production Build

### Option A: Cloud Build (Recommended)

1. **Navigate to app directory:**
   ```bash
   cd mobile_app_node
   ```

2. **Start the build:**
   ```bash
   npm run build:android:production
   ```

3. **Wait for build to complete:**
   - The build happens on Expo's servers
   - You'll see a progress URL in the terminal
   - Build typically takes 10-20 minutes

4. **Download your APK:**
   - The terminal will show a download link when complete
   - Or visit https://expo.dev/accounts/[your-account]/projects/mobile-app/builds
   - Download the APK file

5. **Install on device:**
   ```bash
   # Transfer APK to device and install
   adb install path/to/your-app.apk
   ```

### Option B: Local Build

1. **Ensure Android Studio is set up:**
   - Install Android Studio
   - Install SDK Platform 34 (Android 14)
   - Set ANDROID_HOME environment variable

2. **Run local build:**
   ```bash
   npm run build:android:local
   ```

3. **Find your APK:**
   ```
   mobile_app_node/android/app/build/outputs/apk/release/app-release.apk
   ```

## Build for Google Play Store

To submit to Google Play Store, you need an AAB file:

1. **Create AAB build:**
   ```bash
   npm run build:android:aab
   ```

2. **Download the AAB file** from the Expo dashboard

3. **Submit to Play Store:**
   - Go to Google Play Console
   - Create/select your app
   - Create a new release
   - Upload the AAB file
   - Fill in release details
   - Submit for review

## Signing Keys

EAS automatically manages signing keys for you:

- **First build:** EAS generates a new keystore
- **Subsequent builds:** EAS reuses the same keystore
- **Keys are stored:** Securely on Expo's servers

### Download Your Keystore (Optional)

```bash
eas credentials
```

Select Android → Select your build profile → Download Keystore

## Environment-Specific Builds

### Development Environment

Uses `env.example` configuration (localhost):

```bash
npm run build:android:dev
```

### Staging Environment

1. Create `.env.staging`:
   ```bash
   EXPO_PUBLIC_FRAPPE_URL=https://staging.yourdomain.com
   EXPO_PUBLIC_ACCESS_GATEWAY_URL=https://staging-gateway.yourdomain.com
   ```

2. Build with staging environment:
   ```bash
   APP_ENV=staging eas build --platform android --profile preview
   ```

### Production Environment

1. Create `.env.production` (see setup section above)

2. Build:
   ```bash
   npm run build:android:production
   ```

## Troubleshooting

### Build Fails

1. **Check build logs** on Expo dashboard
2. **Common issues:**
   - Missing dependencies: Run `npm install` in `mobile_app_node`
   - Package name conflicts: Ensure `android.package` in `app.json` is unique
   - Version code issues: Increment `android.versionCode` in `app.json`

### APK Won't Install

1. **Enable "Unknown Sources"** on Android device
2. **Uninstall old version** if upgrading
3. **Check signature mismatch** - Debug and release builds use different signatures

### App Crashes on Launch

1. **Check environment variables** - Ensure `.env.production` has correct URLs
2. **Test with preview build first** before production build
3. **Check logs:** `adb logcat | grep ReactNative`

## Build Status & Management

### Check Build Status

```bash
eas build:list
```

### View Specific Build

```bash
eas build:view [build-id]
```

### Cancel Running Build

```bash
eas build:cancel
```

## Update Package Name (Optional)

The app is currently configured with package name `com.megatechtrackers.premium`.

If you want to change it:

1. **Update `app.json`:**
   ```json
   {
     "android": {
       "package": "com.yourcompany.yourapp"
     },
     "ios": {
       "bundleIdentifier": "com.yourcompany.yourapp"
     }
   }
   ```

2. **Rebuild:**
   ```bash
   npm run build:android:production
   ```

## Version Management

### Update App Version

Edit `app.json`:

```json
{
  "expo": {
    "version": "1.1.0",
    "android": {
      "versionCode": 2
    }
  }
}
```

- `version`: User-facing version (e.g., "1.1.0")
- `versionCode`: Internal version number (must increment for each release)

## Quick Reference

```bash
# Setup
npm install -g eas-cli
eas login
cd mobile_app_node

# Build Commands
npm run build:android:dev        # Development APK
npm run build:android:preview    # Preview/Testing APK
npm run build:android:production # Production APK
npm run build:android:aab        # Production AAB (Play Store)
npm run build:android:local      # Local build

# Management
eas build:list                   # List all builds
eas build:view [build-id]        # View specific build
eas build:cancel                 # Cancel running build
eas credentials                  # Manage signing credentials

# Install on Device
adb install path/to/app.apk
```

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [Google Play Console](https://play.google.com/console/)
- [Expo Dashboard](https://expo.dev/)

## Next Steps

1. ✅ Build development/preview APK for testing
2. ✅ Test on physical Android devices
3. ✅ Update environment variables for production
4. ✅ Build production APK/AAB
5. ✅ Submit to Google Play Store
6. ✅ Set up continuous deployment (optional)

