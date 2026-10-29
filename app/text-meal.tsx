import { Redirect, useLocalSearchParams } from 'expo-router';

/** "Nhập bằng chữ" is part of Add food now (description, photos and the AI in one screen); old links land there with their params. */
export default function TextMealRedirect() {
  const params = useLocalSearchParams<{ text?: string; date?: string }>();
  const kept: Record<string, string> = {};
  if (typeof params.text === 'string') kept.text = params.text;
  if (typeof params.date === 'string') kept.date = params.date;
  return <Redirect href={{ pathname: '/add-food', params: kept }} />;
}
