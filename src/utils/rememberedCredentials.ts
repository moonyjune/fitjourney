import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no real web implementation (native keychain/keystore only), so web falls
// back to localStorage. That means on web these are NOT encrypted at rest — acceptable trade-off
// only because this is a personal single-user app storing its own login, not a shared device.
const EMAIL_KEY = 'remembered_email';
const PASSWORD_KEY = 'remembered_password';

export async function saveRememberedCredentials(email: string, password: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(EMAIL_KEY, email);
      localStorage.setItem(PASSWORD_KEY, password);
      return;
    }
    await SecureStore.setItemAsync(EMAIL_KEY, email);
    await SecureStore.setItemAsync(PASSWORD_KEY, password);
  } catch (error) {
    console.warn('[rememberedCredentials] save failed:', error);
  }
}

export async function loadRememberedCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    if (Platform.OS === 'web') {
      const email = localStorage.getItem(EMAIL_KEY);
      const password = localStorage.getItem(PASSWORD_KEY);
      return email && password ? { email, password } : null;
    }
    const email = await SecureStore.getItemAsync(EMAIL_KEY);
    const password = await SecureStore.getItemAsync(PASSWORD_KEY);
    return email && password ? { email, password } : null;
  } catch (error) {
    console.warn('[rememberedCredentials] load failed:', error);
    return null;
  }
}
