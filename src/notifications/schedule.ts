import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { TRAINING_WEEKDAYS } from '../constants/plan';
import type { PlanData } from '../types';
import { formatGameText } from '../game/strings';
import { useSettingsStore } from '../store/useSettingsStore';
import { currentWaterPlan } from '../water/useWaterPlan';

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
export async function scheduleAllReminders(plan: PlanData): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const meal of plan.mealTemplates.training) {
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

  // Water: the plan generated from the daily target (and drinking window) in force today, not the plan's stored schedule.
  const language = useSettingsStore.getState().language;
  const water = currentWaterPlan(new Date(), plan).schedule;
  for (const [i, checkpoint] of water.entries()) {
    const ml = checkpoint.cumulativeTargetMl - (i > 0 ? water[i - 1].cumulativeTargetMl : 0);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: formatGameText(language, 'water.notifTitle'),
        body: formatGameText(language, 'water.notifBody', { ml, label: checkpoint.label, total: checkpoint.cumulativeTargetMl }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: checkpoint.hour,
        minute: checkpoint.minute,
      },
    });
  }

  // expo-notifications weekday: 1 = Sunday ... 7 = Saturday (matches Date#getDay() + 1).
  const trainingWeekdays = [...TRAINING_WEEKDAYS].map((jsDay) => jsDay + 1);
  for (const workout of plan.workoutTemplates) {
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
