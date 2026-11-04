import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BossArchetype, StageBoss, Zone } from '../../game/stageBosses';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { formatDateVi } from '../../utils/date';
import { HudText } from './HudText';
import { BottomSheet } from './BottomSheet';
import { BOSS_LURE_PINK, StageBossArt } from './StageBossArt';
import { FadeInUp } from './motion/FadeInUp';
import { PulseRing } from './motion/PulseRing';
import { SparkleBurst } from './motion/SparkleBurst';
import { HpBar } from './HpBar';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

export const bossName = (b: Pick<StageBoss, 'archetype'>, g: Translate) => g(`stage.boss.${b.archetype}` as GameKey);
export const rankName = (tier: number, g: Translate) => g(`stage.rank.${Math.max(1, Math.min(5, tier))}` as GameKey);
export const stars = (tier: number) => '★'.repeat(Math.max(1, Math.min(5, tier))) + '☆'.repeat(5 - Math.max(1, Math.min(5, tier)));
export const zoneTitle = (z: Pick<Zone, 'index' | 'nameKey'>, g: Translate) => `${g('stage.zone', { n: z.index + 1 })} · ${g(`region.${z.nameKey}` as GameKey)}`;
/** "21/10" from a YYYY-MM-DD key. */
export const shortDate = (key: string) => formatDateVi(key).slice(0, 5);

export interface ChatLine {
  /** Bold first line (a skill name), optional. */
  title?: string;
  text: string;
}

const TEMPT_COLORS = [BOSS_LURE_PINK, quest.gold, '#FF8FC8', quest.mana];

/** The boss "talking": its portrait with a breathing ring on the left and speech bubbles that pop in one after the
 *  other like a chat. Bubbles are plain text for screen readers; the portrait and effects are decorative. Reusable by
 *  any dialog where a boss speaks (tempting the player, taunting, giving up). */
export function BossChat({ archetype, tier, defeated, name, lines }: { archetype: BossArchetype; tier: number; defeated?: boolean; name: string; lines: ChatLine[] }) {
  const g = useGameText();
  return (
    <View style={styles.chat}>
      <View style={styles.avatarCol}>
        <View style={[styles.avatar, defeated && styles.avatarDown]}>
          <StageBossArt archetype={archetype} tier={tier} size={46} defeated={defeated} idle={!defeated} />
          <PulseRing color={defeated ? quest.border : BOSS_LURE_PINK} borderRadius={28} active={!defeated} />
        </View>
      </View>
      <View style={styles.bubbles}>
        <HudText size={11} color={defeated ? quest.textSecondary : quest.hpText}>
          {g('stage.chat.a11y', { name })}
        </HudText>
        {lines.map((l, i) => (
          <FadeInUp key={i} delay={250 + i * 420} distance={10} style={[styles.bubble, i === 0 && styles.bubbleFirst]}>
            {l.title && (
              <HudText size={13} color={quest.goldLight}>
                {l.title}
              </HudText>
            )}
            <HudText size={13} weight="medium" color={quest.text}>
              {l.text}
            </HudText>
          </FadeInUp>
        ))}
      </View>
    </View>
  );
}

interface DetailProps {
  boss: StageBoss | null;
  zone: Zone | undefined;
  currentKg: number;
  onClose: () => void;
  /** Shown under the chat (the Map puts the boss's damage log here). */
  children?: ReactNode;
}

/** A stage boss up close: big portrait, tier, band, when it fell (or how many kg are left), the boss itself speaking
 *  its skills as chat bubbles, then any `children`. */
export function StageBossDetail({ boss, zone, currentKg, onClose, children }: DetailProps) {
  const g = useGameText();
  if (!boss) return null;
  const name = bossName(boss, g);
  const defeated = boss.status === 'defeated';
  const status = defeated
    ? boss.defeatedDateKey
      ? boss.daysTaken != null
        ? g('stage.detailDefeated', { date: formatDateVi(boss.defeatedDateKey), n: boss.daysTaken })
        : g('stage.detailDefeatedNoDays', { date: formatDateVi(boss.defeatedDateKey) })
      : g('stage.defeatedNoDate')
    : g('stage.detailLeft', { kg: Math.max(0, currentKg - boss.toKg).toFixed(1) });
  const lines: ChatLine[] = defeated
    ? [{ text: g('stage.taunt.defeated') }]
    : [
        { text: g(boss.status === 'current' ? 'stage.taunt.intro' : 'stage.taunt.locked', { kg: boss.toKg }) },
        ...boss.skills.map((s) => ({ title: g(`stage.skill.${s}` as GameKey), text: g(`stage.skill.${s}.desc` as GameKey) })),
      ];

  return (
    <BottomSheet visible onClose={onClose} closeLabel={g('stage.close')} eyebrow={zone ? zoneTitle(zone, g) : undefined} testID="stage-boss-sheet">
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.portrait, { borderColor: defeated ? quest.border : boss.tier >= 4 ? quest.gold : quest.bossBorder }]}>
            <StageBossArt archetype={boss.archetype} tier={boss.tier} size={130} defeated={defeated} idle={!defeated} />
            {!defeated && (
              <View style={styles.burst}>
                <SparkleBurst count={10} radius={74} colors={TEMPT_COLORS} />
              </View>
            )}
          </View>
          <HudText size={20} accessibilityRole="header" style={styles.center}>
            {name}
          </HudText>
          <HudText size={13} color={quest.gold} style={styles.center} accessibilityLabel={`${g('stage.tier', { n: boss.tier })} · ${rankName(boss.tier, g)}`}>
            {`${stars(boss.tier)} · ${rankName(boss.tier, g)}${boss.isFinal ? ` · ${g('stage.final')}` : ''}`}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.center}>
            {`${g('stage.tier', { n: boss.tier })} · ${g('region.range', { from: boss.fromKg, to: boss.toKg })} · ${g('stage.hp', { left: boss.hpLeftKg.toFixed(1), max: boss.hpKg })}`}
          </HudText>
          <View style={styles.hpBar}>
            <HpBar left={boss.hpLeftKg} max={boss.hpKg} trackColor={quest.bg} height={10} from={0} />
          </View>
          <HudText size={14} color={defeated ? quest.xp : quest.hpText} style={styles.center}>
            {status}
          </HudText>
        </View>
        <BossChat archetype={boss.archetype} tier={boss.tier} defeated={defeated} name={name} lines={lines} />
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 8 },
  hero: { alignItems: 'stretch', gap: 4, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  hpBar: { marginTop: 6 },
  portrait: { alignSelf: 'center', width: 160, height: 160, borderRadius: 80, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bossPanel, marginBottom: 6 },
  burst: { position: 'absolute', left: 80, top: 80, pointerEvents: 'none' },
  center: { textAlign: 'center' },
  chat: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatarCol: { paddingTop: 2 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bossPanel, borderWidth: 1.5, borderColor: quest.bossBorder },
  avatarDown: { opacity: 0.7 },
  bubbles: { flex: 1, minWidth: 0, gap: 8 },
  bubble: { gap: 2, paddingVertical: 9, paddingHorizontal: 12, borderRadius: questRadius.panel, borderTopLeftRadius: 4, backgroundColor: quest.raised2, borderWidth: 1, borderColor: quest.border },
  bubbleFirst: { borderColor: '#5A2848', backgroundColor: quest.bossPanel },
});
