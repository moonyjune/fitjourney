import { forwardRef, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';
import { useGameText } from '../../game/strings';
import { showToast } from '../../store/useToastStore';
import { quest } from '../../theme/quest';
import { pullDistance, pullPhase, releaseRefreshes } from '../../utils/pullRefresh';
import { HudText } from './HudText';

/** Pull to refresh (1.7). The default refresh pulls the signed-in user's data from the cloud (restoreOwnData, the same pull as at
 *  start-up), so what another device synced shows up and the screen works itself out again. */
export async function refreshFromCloud(): Promise<boolean> {
  // Loaded on the first pull only: the sync module creates the Supabase client, which every screen using this frame would otherwise
  // load (and every screen test would have to stub).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { restoreOwnData } = require('../../sync/restore') as typeof import('../../sync/restore');
  return (await restoreOwnData()).ok;
}

export interface RefreshableScrollViewProps extends ScrollViewProps {
  /** What a pull does; resolves to false when it failed. Default: refreshFromCloud. null switches pull to refresh off. */
  onPullRefresh?: (() => Promise<boolean | void>) | null;
  /** Says "Đã cập nhật…" / the failure after a pull (default true). */
  toastResult?: boolean;
}

/** A ScrollView with pull to refresh: React Native's RefreshControl on a phone app, a hand-made pull on the web (where RefreshControl
 *  does nothing): at the top of the list, pulling down shows "Kéo xuống… / Thả ra… / Đang làm mới…" and letting go past the line
 *  refreshes. A sideways drag (the Journal's day swipe) never starts a pull. */
export const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(function RefreshableScrollView(
  { onPullRefresh, toastResult = true, onScroll, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, children, scrollEventThrottle, ...rest },
  ref
) {
  const g = useGameText();
  const [refreshing, setRefreshing] = useState(false);
  const [distance, setDistance] = useState(0);
  const atTop = useRef(true);
  const start = useRef<{ x: number; y: number } | null>(null);
  const action = onPullRefresh === undefined ? refreshFromCloud : onPullRefresh;

  const run = useCallback(async () => {
    if (!action || refreshing) return;
    setRefreshing(true);
    let ok = true;
    try {
      ok = (await action()) !== false;
    } catch {
      ok = false;
    } finally {
      setRefreshing(false);
      setDistance(0);
    }
    if (toastResult) showToast({ text: g(ok ? 'ptr.done' : 'ptr.failed') });
  }, [action, refreshing, toastResult, g]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = e.nativeEvent.contentOffset.y <= 0;
    onScroll?.(e);
  };

  if (!action) {
    return (
      <ScrollView ref={ref} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel} scrollEventThrottle={scrollEventThrottle} {...rest}>
        {children}
      </ScrollView>
    );
  }

  if (Platform.OS !== 'web') {
    return (
      <ScrollView
        ref={ref}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        scrollEventThrottle={scrollEventThrottle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={run} tintColor={quest.gold} colors={[quest.gold]} />}
        {...rest}
      >
        {children}
      </ScrollView>
    );
  }

  const point = (e: GestureResponderEvent) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  const phase = pullPhase(distance, refreshing);
  const shown = refreshing ? 48 : distance;

  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onScroll={handleScroll}
      onTouchStart={(e) => {
        start.current = atTop.current && !refreshing ? point(e) : null;
        onTouchStart?.(e);
      }}
      onTouchMove={(e) => {
        if (start.current && atTop.current) {
          const p = point(e);
          setDistance(pullDistance(p.y - start.current.y, p.x - start.current.x));
        }
        onTouchMove?.(e);
      }}
      onTouchEnd={(e) => {
        const release = releaseRefreshes(distance);
        start.current = null;
        if (release) run();
        else setDistance(0);
        onTouchEnd?.(e);
      }}
      onTouchCancel={(e) => {
        start.current = null;
        setDistance(0);
        onTouchCancel?.(e);
      }}
      {...rest}
    >
      {shown > 0 && (
        <View style={[styles.indicator, { height: shown }]} accessibilityLiveRegion="polite" testID="pull-refresh-indicator">
          {phase === 'refreshing' ? <ActivityIndicator size="small" color={quest.gold} /> : null}
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g(phase === 'refreshing' ? 'ptr.refreshing' : phase === 'armed' ? 'ptr.release' : 'ptr.pull')}
          </HudText>
        </View>
      )}
      {children}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  indicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
});
