# Quick Build Instructions

## 🚀 Quick Start

### First Time Setup (One-time)

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Login to Expo
eas login

# 3. Navigate to app directory
cd apps/react-native-app

# 4. Configure project (creates project ID)
eas build:configure
```

### Create Production Build

```bash
# For APK (direct installation)
npm run build:android:production

# For AAB (Google Play Store)
npm run build:android:aab
```

## 📦 Build Profiles

| Profile | Command | Output | Use Case |
|---------|---------|--------|----------|
| **development** | `npm run build:android:dev` | Debug APK | Development & testing |
| **preview** | `npm run build:android:preview` | Release APK | Internal testing/QA |
| **production** | `npm run build:android:production` | Release APK | Production distribution |
| **production-aab** | `npm run build:android:aab` | AAB | Google Play Store |

## ⚙️ Environment Setup

Create `.env.production` in `apps/react-native-app/`:

```bash
EXPO_PUBLIC_FRAPPE_URL=https://your-production-frappe-url.com
EXPO_PUBLIC_ACCESS_GATEWAY_URL=https://your-production-gateway-url.com
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id
```

## 🔑 Important Notes

1. **First build:** EAS will automatically create and manage signing keys
2. **Build time:** Cloud builds take 10-20 minutes
3. **Build status:** Check at https://expo.dev/accounts/[your-account]/projects/mobile-app/builds
4. **Package name:** `com.megatechtrackers.premium` (change in `app.json` if needed)

## 📱 Install on Device

### Via Cable (ADB)
```bash
adb install path/to/your-app.apk
```

### Via Direct Download
1. Download APK from Expo dashboard
2. Transfer to device (email, drive, etc.)
3. Enable "Install from Unknown Sources" on device
4. Tap APK to install

## 🔍 Build Management

```bash
# List all builds
eas build:list

# View specific build
eas build:view [build-id]

# Cancel running build
eas build:cancel

# Manage credentials
eas credentials
```

## 📚 Full Documentation

For detailed instructions, see [docs/android-build.md](../../docs/android-build.md)

## 🆘 Troubleshooting

### Build Fails
- Check logs on Expo dashboard
- Run `npm install` to ensure dependencies are up to date
- Increment `versionCode` in `app.json` if updating existing app

### Can't Install APK
- Enable "Unknown Sources" on device
- Uninstall old version first
- Check if debug vs release signature mismatch

### App Crashes
- Verify `.env.production` has correct URLs
- Test with preview build first
- Check logs: `adb logcat | grep ReactNative`

## 🎯 Recommended Flow

1. **Test locally first**: Ensure app works in emulator/device via `expo start --android`
2. **Preview build**: `npm run build:android:preview` for testing
3. **Production build**: `npm run build:android:production` when ready
4. **Play Store**: `npm run build:android:aab` for store submission

