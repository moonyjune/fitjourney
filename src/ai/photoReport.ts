import { AccessibilityInfo } from 'react-native';
import type { PhotoReportRequest } from '../../supabase/functions/_shared/photoReport';
import { useHiddenPhotoStore } from '../store/useHiddenPhotoStore';
import { showToast } from '../store/useToastStore';
import { requestPhotoReport } from '../sync/cloudSync';

/** "Ảnh sai?" (1.5): the player says the photo shown with a dish is not that dish. It is hidden for them at once (the dish's emoji
 *  shows instead, on every screen) and a toast offers "Hoàn tác"; once the toast is gone without undo, the report goes to the
 *  server (report-photo), which flags the photo so a new one is looked for. Returns nothing; the server's answer only matters there. */
export function reportWrongPhoto(report: PhotoReportRequest, text: string, send: (r: PhotoReportRequest) => Promise<unknown> = requestPhotoReport): void {
  const store = useHiddenPhotoStore.getState();
  store.hide(report.url);
  AccessibilityInfo.announceForAccessibility?.(text);
  showToast({
    text,
    tone: 'neutral',
    undo: () => useHiddenPhotoStore.getState().unhide(report.url),
    onExpire: () => {
      void send(report).catch(() => undefined);
    },
  });
}
