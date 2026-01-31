// Platform detection
export const IS_WEB = typeof document !== 'undefined';

// Get base URLs from environment
const envFrappeUrl = process.env.EXPO_PUBLIC_FRAPPE_URL || 'http://localhost:8000';
const envAccessGatewayUrl = process.env.EXPO_PUBLIC_ACCESS_GATEWAY_URL || 'http://localhost:3001';

// On web (browser), always use localhost - browsers can't reach 10.0.2.2
// On Android emulator, use 10.0.2.2 to reach host machine
// On iOS simulator, use localhost
export const FRAPPE_URL = IS_WEB 
  ? envFrappeUrl.replace(/10\.0\.2\.2/g, 'localhost')
  : envFrappeUrl;

export const ACCESS_GATEWAY_URL = IS_WEB
  ? envAccessGatewayUrl.replace(/10\.0\.2\.2/g, 'localhost')
  : envAccessGatewayUrl;


