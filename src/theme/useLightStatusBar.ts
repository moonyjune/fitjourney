import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';

/** Dark FitQuest screens need light status-bar icons; hand control back to the (still light)
 *  classic screens when the screen loses focus. */
export function useLightStatusBar(): void {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, [])
  );
}
