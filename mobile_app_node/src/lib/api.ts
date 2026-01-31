import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserPermissions } from '@/types';
import { isOnline } from '@/utils/offline';
import { ACCESS_GATEWAY_URL, FRAPPE_URL, IS_WEB } from '@/lib/urls';

const CACHE_KEYS = {
  USER_PERMISSIONS: 'cached_user_permissions',
  EMBED_URL: 'cached_embed_url',
};

const getFrappeClient = async () => {
  const sessionId = await AsyncStorage.getItem('frappe_session');
  // Web: rely on browser cookies (withCredentials) - don't manually set Cookie header.
  // Native: manually send sid via Cookie header.
  return axios.create(
    IS_WEB
      ? {
          baseURL: FRAPPE_URL,
          withCredentials: true,
        }
      : {
          baseURL: FRAPPE_URL,
          headers: {
            'Cookie': sessionId ? `sid=${sessionId}` : undefined,
          },
        }
  );
};

const getGrafanaClient = async () => {
  const frappeUser = await AsyncStorage.getItem('frappe_user');
  const sessionId = await AsyncStorage.getItem('frappe_session');
  // Web: rely on browser cookies to send sid to access-gateway; provide user header.
  // Native: also send sid explicitly.
  return axios.create({
    baseURL: ACCESS_GATEWAY_URL,
    withCredentials: IS_WEB,
    headers: {
      'X-Frappe-User': frappeUser || '',
      ...(IS_WEB ? {} : { 'X-Frappe-Session-Id': sessionId ? `sid=${sessionId}` : '' }),
    },
  });
};

export async function getUserPermissions(user: string): Promise<UserPermissions> {
  const cacheKey = `${CACHE_KEYS.USER_PERMISSIONS}_${user}`;
  
  // Check cache first
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Return cached data immediately, then refresh in background if online
      if (await isOnline()) {
        refreshUserPermissions(user, cacheKey).catch(console.error);
      }
      return parsed;
    }
  } catch (e) {
    // Ignore cache errors
  }

  // If offline and no cache, throw error
  if (!(await isOnline())) {
    throw new Error('No internet connection and no cached data available');
  }

  // Fetch from API
  const client = await getFrappeClient();
  const response = await client.get(
    `/api/method/megatechtrackers.api.permissions.get_user_permissions`,
    {
      params: { user },
    }
  );
  
  const data = response.data.message;
  
  // Cache the result
  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (e) {
    // Ignore cache errors
  }
  
  return data;
}

async function refreshUserPermissions(user: string, cacheKey: string): Promise<void> {
  try {
    const client = await getFrappeClient();
    const response = await client.get(
      `/api/method/megatechtrackers.api.permissions.get_user_permissions`,
      {
        params: { user },
      }
    );
    await AsyncStorage.setItem(cacheKey, JSON.stringify(response.data.message));
  } catch (e) {
    // Ignore refresh errors
  }
}

export async function generateEmbedUrl({
  reportId,
  reportUid,
  filters,
  frappeUser,
}: {
  reportId: number;
  reportUid?: string;
  filters: Record<string, any>;
  frappeUser: string;
}): Promise<string> {
  // Check if offline
  if (!(await isOnline())) {
    throw new Error('Cannot generate embed URL while offline');
  }

  const client = await getGrafanaClient();
  const response = await client.post('/api/grafana/generate-embed-url', {
    reportId,
    reportUid,
    filters,
    frappeUser,
  });
  return response.data.embedUrl;
}
