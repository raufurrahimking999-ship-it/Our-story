/**
 * Premium Native Android & Web Daily Anniversary Notification Service
 * for "Our Little Story"
 * 
 * Design & Philosophy:
 * - Minimal, elegant, personal, and deeply romantic
 * - Natural and intimate wording matching the app's aesthetic
 * - Exact milestone delivery calculated from RELATIONSHIP_CONFIG (one notification per completed day)
 * - Native Capacitor LocalNotifications scheduling for background/closed/locked Android states
 * - Exactly the 20 romantic notification messages specified by the user
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions, Channel } from '@capacitor/local-notifications';
import { RELATIONSHIP_CONFIG } from '../config';

const STORAGE_KEYS = {
  NOTIFICATION_PERMISSION_REQUESTED: 'rls_notification_perm_requested',
  LAST_SCHEDULED_TIMESTAMP: 'rls_last_scheduled_timestamp',
};

export interface AnniversaryMessage {
  summary: string;
  body: string;
}

export const ROTATING_ROMANTIC_MESSAGES: AnniversaryMessage[] = [
  {
    summary: 'Another day with you in my thoughts',
    body: 'And somehow that still feels like the sweetest thing. ❤️',
  },
  {
    summary: 'No matter how the day goes',
    body: 'There’s always a little part of it that belongs to you.',
  },
  {
    summary: 'Just a little reminder',
    body: 'Somewhere in my heart, you’re always home. 🤍',
  },
  {
    summary: 'Another day, another reason',
    body: 'To be grateful that our story exists. ✨',
  },
  {
    summary: 'If I could pause one moment forever',
    body: 'It would probably be one with you.',
  },
  {
    summary: 'You’re still my favorite thought',
    body: 'At the most random moments. 🫶',
  },
  {
    summary: 'Days keep passing',
    body: 'But somehow my feelings keep finding new ways to stay.',
  },
  {
    summary: 'A little notification',
    body: 'From someone who still chooses you, every single day. ❤️',
  },
  {
    summary: 'Some people become memories',
    body: 'You became a part of my everyday life.',
  },
  {
    summary: 'Today is just another page',
    body: 'Of our little story. Let’s make it beautiful. 📖',
  },
  {
    summary: 'Even on an ordinary day',
    body: 'Thinking about you makes it feel a little less ordinary.',
  },
  {
    summary: 'I don’t need a special day to miss you',
    body: 'Somehow, I do it naturally.',
  },
  {
    summary: 'Another sunrise, another day closer',
    body: 'To all the moments we’re yet to live. 🌙',
  },
  {
    summary: 'If love had a favorite notification',
    body: 'I think it would be your name.',
  },
  {
    summary: 'Somewhere between yesterday and tomorrow',
    body: 'There’s this beautiful little ‘us’. 🤍',
  },
  {
    summary: 'Time keeps moving',
    body: 'But I hope our little story keeps growing with it.',
  },
  {
    summary: 'Just checking in from the heart',
    body: 'You’re still there. You never really left.',
  },
  {
    summary: 'One more day added to our story',
    body: 'One more memory waiting to be made. ✨',
  },
  {
    summary: 'Whatever today brings',
    body: 'Remember there’s someone who’s quietly thinking of you.',
  },
  {
    summary: 'Good morning, my favorite person',
    body: 'Another day, another little chapter of us. ❤️',
  },
];

class NotificationService {
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    try {
      if (Capacitor.isNativePlatform()) {
        await this.initNativeAndroidNotifications();
      } else {
        await this.initWebNotifications();
      }
    } catch (err) {
      console.warn('Failed to initialize notifications:', err);
    }
  }

  /**
   * Native Android Notification Setup & Channel Registration
   */
  private async initNativeAndroidNotifications(): Promise<void> {
    try {
      const channel: Channel = {
        id: 'daily_anniversary_channel',
        name: 'Daily Love Anniversary',
        description: 'Daily anniversary milestone notifications for Our Little Story',
        importance: 4, // High importance for status bar & lockscreen display
        visibility: 1, // Public on lockscreen
        vibration: true,
        lights: true,
        lightColor: '#818cf8', // Soft lavender/indigo accent glow
      };

      await LocalNotifications.createChannel(channel);

      const permStatus = await LocalNotifications.checkPermissions();
      const hasPrompted = localStorage.getItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED) === 'true';

      if (permStatus.display === 'granted') {
        await this.scheduleUpcomingDailyAnniversaries();
      } else if (!hasPrompted) {
        localStorage.setItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED, 'true');
        const req = await LocalNotifications.requestPermissions();
        if (req.display === 'granted') {
          await this.scheduleUpcomingDailyAnniversaries();
        }
      }

      LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        console.log('Anniversary notification opened:', notificationAction.notification.id);
      });
    } catch (e) {
      console.warn('Native notification setup error:', e);
    }
  }

  /**
   * Schedule next 30 days of daily milestone notifications exactly at day completion
   */
  public async scheduleUpcomingDailyAnniversaries(): Promise<void> {
    try {
      const now = Date.now();
      const startMs = RELATIONSHIP_CONFIG.startTimestamp;
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const elapsedMs = Math.max(0, now - startMs);
      const currentCompletedDays = Math.floor(elapsedMs / ONE_DAY_MS);

      const pending = await LocalNotifications.getPending();
      const pendingIds = new Set(pending.notifications.map((n) => n.id));

      const notificationsToSchedule = [];

      for (let offset = 1; offset <= 30; offset++) {
        const targetDayCount = currentCompletedDays + offset;
        const targetTimestamp = startMs + targetDayCount * ONE_DAY_MS;
        const notifId = 10000 + (targetDayCount % 90000);

        if (targetTimestamp > now && !pendingIds.has(notifId)) {
          const messageTemplate = ROTATING_ROMANTIC_MESSAGES[targetDayCount % ROTATING_ROMANTIC_MESSAGES.length];
          const fullMessageText = `${messageTemplate.summary} — ${messageTemplate.body}`;

          notificationsToSchedule.push({
            id: notifId,
            title: 'Our Little Story 🤍',
            body: fullMessageText,
            schedule: {
              at: new Date(targetTimestamp),
              allowWhileIdle: true,
            },
            channelId: 'daily_anniversary_channel',
            smallIcon: 'icon',
            iconColor: '#818cf8',
            autoCancel: true,
            extra: {
              dayCount: targetDayCount,
              milestoneTime: targetTimestamp,
            },
          });
        }
      }

      if (notificationsToSchedule.length > 0) {
        const scheduleOptions: ScheduleOptions = {
          notifications: notificationsToSchedule,
        };
        await LocalNotifications.schedule(scheduleOptions);
        localStorage.setItem(STORAGE_KEYS.LAST_SCHEDULED_TIMESTAMP, String(now));
      }
    } catch (err) {
      console.warn('Could not schedule anniversary notifications:', err);
    }
  }

  /**
   * Web browser notification fallback
   */
  private async initWebNotifications(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    try {
      const hasPrompted = localStorage.getItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED) === 'true';

      if (Notification.permission === 'granted') {
        this.checkAndSendWebDailyNotification();
      } else if (Notification.permission === 'default' && !hasPrompted) {
        localStorage.setItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED, 'true');
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          this.checkAndSendWebDailyNotification();
        }
      }
    } catch (e) {
      console.warn('Web notification setup error:', e);
    }
  }

  private checkAndSendWebDailyNotification() {
    if (Notification.permission !== 'granted') return;

    const now = Date.now();
    const startMs = RELATIONSHIP_CONFIG.startTimestamp;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const currentCompletedDays = Math.floor(Math.max(0, now - startMs) / ONE_DAY_MS);
    const lastNotifiedDayKey = 'rls_last_web_notified_day';
    const lastNotifiedDay = parseInt(localStorage.getItem(lastNotifiedDayKey) || '0', 10);

    if (currentCompletedDays > lastNotifiedDay && currentCompletedDays > 0) {
      localStorage.setItem(lastNotifiedDayKey, String(currentCompletedDays));
      const messageTemplate = ROTATING_ROMANTIC_MESSAGES[currentCompletedDays % ROTATING_ROMANTIC_MESSAGES.length];

      try {
        new Notification('Our Little Story 🤍', {
          body: `${messageTemplate.summary} — ${messageTemplate.body}`,
          icon: '/icon-192.png',
          badge: '/favicon.png',
          tag: `anniversary-day-${currentCompletedDays}`,
        });
      } catch {}
    }
  }

  /**
   * Immediately triggers a single test notification matching the style, channels,
   * templates, and icons of the existing notifications for direct debugging on APK/Web.
   */
  public async triggerImmediateTestNotification(): Promise<void> {
    try {
      const now = Date.now();
      const startMs = RELATIONSHIP_CONFIG.startTimestamp;
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const currentCompletedDays = Math.floor(Math.max(0, now - startMs) / ONE_DAY_MS) || 1;

      const messageTemplate = ROTATING_ROMANTIC_MESSAGES[currentCompletedDays % ROTATING_ROMANTIC_MESSAGES.length];
      const fullMessageText = `${messageTemplate.summary} — ${messageTemplate.body}`;

      if (Capacitor.isNativePlatform()) {
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              id: 99999,
              title: 'Our Little Story 🤍 (Test)',
              body: fullMessageText,
              schedule: { at: new Date(Date.now() + 500) }, // Trigger in 500ms
              channelId: 'daily_anniversary_channel',
              smallIcon: 'icon',
              iconColor: '#818cf8',
              autoCancel: true,
              extra: {
                dayCount: currentCompletedDays,
                milestoneTime: now,
                isTest: true,
              },
            }
          ]
        });
      } else {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission !== 'granted') {
            await Notification.requestPermission();
          }
          if (Notification.permission === 'granted') {
            new Notification('Our Little Story 🤍 (Test)', {
              body: fullMessageText,
              icon: '/icon-192.png',
              badge: '/favicon.png',
              tag: `test-anniversary-${now}`,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to trigger immediate test notification:', e);
    }
  }
}

export const notificationService = new NotificationService();
