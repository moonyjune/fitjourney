import { useState } from 'react';
import { signOutAndReset } from '../../auth/signOut';
import { useGameText } from '../../game/strings';
import { useAuthStore } from '../../store/useAuthStore';
import { flushSyncQueue } from '../../sync/cloudSync';
import { useSyncQueueStore } from '../../sync/syncQueue';
import { quest } from '../../theme/quest';
import { ConfirmSheet } from './ConfirmSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

/** "Đăng xuất" with its confirm box (dialogs.md decision 10): with changes still waiting to sync, the box says "n thay đổi chưa đồng bộ
 *  sẽ được gửi trước", sends them and only then signs out. If some could not be sent (no connection), it stays open and says so; the
 *  user can try again or sign out anyway. With nothing waiting there is no extra line. */
export function SignOutButton() {
  const g = useGameText();
  const pending = useSyncQueueStore((s) => s.pending.length);
  const devMode = useAuthStore((s) => s.devMode);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const waiting = devMode ? 0 : pending;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    if (waiting > 0 && !failed) {
      await flushSyncQueue().catch(() => undefined);
      const left = useSyncQueueStore.getState().pending.length;
      if (left > 0) {
        setFailed(true);
        setBusy(false);
        return;
      }
    }
    await signOutAndReset();
    setBusy(false);
    setOpen(false);
  }

  function close() {
    setOpen(false);
    setFailed(false);
  }

  return (
    <>
      <QuestButton variant="ghost" icon="out" title={g('profile.signOut')} onPress={() => setOpen(true)} />
      <ConfirmSheet
        visible={open}
        onCancel={close}
        onConfirm={() => {
          void confirm();
        }}
        title={g('rd6.signOut.title')}
        message={waiting > 0 && !failed && !busy ? g('rd6.signOut.pending', { n: waiting }) : undefined}
        confirmLabel={failed ? g('rd6.signOut.anyway') : g('profile.signOut')}
        busy={busy}
        testID="sign-out-confirm"
      >
        {busy && waiting > 0 && !failed ? (
          <HudText size={13} weight="medium" color={quest.manaText} accessibilityLiveRegion="polite">
            {g('rd6.signOut.sending', { n: waiting })}
          </HudText>
        ) : null}
        {failed ? (
          <HudText size={13} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {g('rd6.signOut.stillPending', { n: waiting })}
          </HudText>
        ) : null}
      </ConfirmSheet>
    </>
  );
}
