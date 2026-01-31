import { Platform } from 'react-native';

// Lazy-load expo-notifications to avoid side-effect import errors
// on Android development builds without Firebase/FCM configured
let Notifications: typeof import('expo-notifications') | null = null;
let notificationsInitialized = false;

async function getNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (notificationsInitialized) return Notifications;
  notificationsInitialized = true;
  
  if (Platform.OS === 'web') return null;
  
  try {
    Notifications = await import('expo-notifications');
    
    // Configure notification handler
    if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    return Notifications;
  } catch (e) {
    console.warn('expo-notifications not available:', e);
    return null;
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const notif = await getNotificationsModule();
    if (!notif) return false;
    
    const { status: existingStatus } = await notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notif.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    // Configure for Android
    if (Platform.OS === 'android') {
      await notif.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: notif.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Get notification token for push notifications
 */
export async function getNotificationToken(): Promise<string | null> {
  try {
    const notif = await getNotificationsModule();
    if (!notif) return null;
    
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const tokenData = await notif.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });

    return tokenData.data;
  } catch (error) {
    console.error('Error getting notification token:', error);
    return null;
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<string> {
  const notif = await getNotificationsModule();
  if (!notif) {
    throw new Error('Notifications not available');
  }
  
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permissions not granted');
  }

  const notificationId = await notif.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null, // Show immediately
  });

  return notificationId;
}

/**
 * Cancel a notification
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif) return;
  await notif.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel all notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif) return;
  await notif.cancelAllScheduledNotificationsAsync();
}

/**
 * Get notification count badge
 */
export async function getBadgeCount(): Promise<number> {
  const notif = await getNotificationsModule();
  if (!notif) return 0;
  return await notif.getBadgeCountAsync();
}

/**
 * Set notification count badge
 */
export async function setBadgeCount(count: number): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif) return;
  await notif.setBadgeCountAsync(count);
}

/**
 * Clear badge count
 */
export async function clearBadge(): Promise<void> {
  const notif = await getNotificationsModule();
  if (!notif) return;
  await notif.setBadgeCountAsync(0);
}
