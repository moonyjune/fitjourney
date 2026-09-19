import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { MEAL_TEMPLATES, TRAINING_WEEKDAYS, WATER_REMINDER_TIMES, WORKOUT_TEMPLATES } from '../constants/plan';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Meal times are identical for training/rest days (only the menu content differs),
// so meal reminders use the 'training' template purely as the time reference.
export async function scheduleAllReminders(): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const meal of MEAL_TEMPLATES.training) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Đến giờ ${meal.label}`,
        body: 'Mở app để xem thực đơn hôm nay và ghi nhận bữa ăn.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: meal.startHour,
        minute: meal.startMinute,
      },
    });
  }

  for (const water of WATER_REMINDER_TIMES) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nhắc uống nước 💧',
        body: 'Đừng quên uống nước để đạt mục tiêu 4.5L hôm nay.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: water.hour,
        minute: water.minute,
      },
    });
  }

  // expo-notifications weekday: 1 = Sunday ... 7 = Saturday (matches Date#getDay() + 1).
  const trainingWeekdays = [...TRAINING_WEEKDAYS].map((jsDay) => jsDay + 1);
  for (const workout of WORKOUT_TEMPLATES) {
    if (!workout.reminderSlot || workout.startHour === undefined || workout.startMinute === undefined) continue;
    for (const weekday of trainingWeekdays) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Đến giờ tập: ${workout.label}`,
          body: workout.description,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: workout.startHour,
          minute: workout.startMinute,
        },
      });
    }
  }
}

export async function cancelAllReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
