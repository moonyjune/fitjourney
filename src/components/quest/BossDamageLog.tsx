import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BossDamage, DamageDay, DamageLog, WeightLogRow } from '../../game/bossDamage';
import { deficitColor, deficitLevel } from '../../game/deficitLevel';
import type { StageBoss } from '../../game/stageBosses';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { KCAL_PER_KG_FAT } from '../../utils/tdee';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestSegment } from './QuestSegment';
import { StageBossArt } from './StageBossArt';
import { bossName, shortDate } from './StageBossDetail';
import { BanterChat } from './BattleBanter';
import type { BanterShown } from '../../banter/days';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;
type LogView = 'days' | 'weight';

/** Rows shown at first and added by each "show more". */
const PAGE = 14;

/** Kg lost as damage: "−0.12" for a loss, "+0.05" for a gain. */
export function signedKg(lostKg: number, digits = 2): string {
  const v = Math.abs(lostKg).toFixed(digits);
  if (Number(v) === 0) return v;
  return lostKg > 0 ? `−${v}` : `+${v}`;
}

/** A horizontal bar for one damage figure, scaled against the biggest one shown. */
function Bar({ value, scale, color }: { value: number; scale: number; color: string }) {
  const pct = scale > 0 ? Math.min(1, Math.abs(value) / scale) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(pct * 100, value !== 0 ? 3 : 0)}%`, backgroundColor: color }]} />
    </View>
  );
}

interface DayRowProps {
  day: DamageDay;
  /** The boss the day hit, drawn on the left when given. */
  boss?: StageBoss;
  bosses: StageBoss[];
  targetKcal: number;
  cheat: boolean;
  /** Kg that fills a whole bar. */
  scale: number;
  /** That day's exchange with the boss: the row then opens it on tap. */
  talk?: BanterShown;
}

/** One day of the damage log: the deficit (coloured by its level against the target) and its estimated damage against
 *  the real damage of that day's weigh-in, plus any boss that fell. With a `talk`, a tap opens that day's exchange below. */
export function DamageDayRow({ day, boss, bosses, targetKcal, cheat, scale, talk }: DayRowProps) {
  const g = useGameText();
  const [open, setOpen] = useState(false);
  const level = deficitLevel(day.deficitKcal, targetKcal, cheat);
  const estColor = deficitColor(level, quest.gold);
  const realColor = day.realKg != null && day.realKg < 0 ? quest.hp : quest.xp;
  const intake =
    day.deficitKcal == null
      ? g('dmg.noFood')
      : g(day.deficitKcal >= 0 ? 'dmg.deficit' : 'dmg.surplus', { n: Math.round(Math.abs(day.deficitKcal)).toLocaleString('en-US') });
  const est = day.estKg == null ? g('dmg.noFood') : `${signedKg(day.estKg)} kg`;
  const real = day.realKg == null ? g('dmg.noWeigh') : `${signedKg(day.realKg)} kg`;
  const felled = day.felled.map((i) => bosses[i]).filter((b): b is StageBoss => !!b);
  const label = [
    shortDate(day.dateKey),
    boss ? g('dmg.vs', { name: bossName(boss, g) }) : '',
    intake + (level ? ` · ${g(`deficit.level.${level}` as GameKey)}` : ''),
    `${g('dmg.est')} ${est}`,
    `${g('dmg.real')} ${real}`,
    ...felled.map((b) => g('dmg.felled', { name: bossName(b, g) })),
  ]
    .filter(Boolean)
    .join('. ');
  const content = (
    <>
      {boss && (
        <View style={styles.rowArt}>
          <StageBossArt archetype={boss.archetype} tier={boss.tier} size={30} defeated={felled.includes(boss)} />
        </View>
      )}
      <View style={styles.flex}>
        <View style={styles.rowHead}>
          <HudText size={13}>{shortDate(day.dateKey)}</HudText>
          <HudText size={11} weight="medium" color={day.deficitKcal == null ? quest.textSecondary : estColor} style={styles.flex} numberOfLines={1}>
            {intake + (level ? ` · ${g(`deficit.level.${level}` as GameKey)}` : '')}
          </HudText>
          {day.weightKg != null && (
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('dmg.weigh', { kg: day.weightKg.toFixed(1) })}
            </HudText>
          )}
        </View>
        <View style={styles.barLine}>
          <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.barLabel}>
            {g('dmg.est')}
          </HudText>
          <Bar value={day.estKg ?? 0} scale={scale} color={estColor} />
          <HudText size={11} color={day.estKg == null ? quest.textTertiary : estColor} style={styles.barValue}>
            {est}
          </HudText>
        </View>
        <View style={styles.barLine}>
          <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.barLabel}>
            {g('dmg.real')}
          </HudText>
          <Bar value={day.realKg ?? 0} scale={scale} color={realColor} />
          <HudText size={11} color={day.realKg == null ? quest.textTertiary : realColor} style={styles.barValue}>
            {real}
          </HudText>
        </View>
        {felled.map((b) => (
          <HudText key={b.index} size={12} color={quest.gold}>
            {g('dmg.felled', { name: bossName(b, g) })}
          </HudText>
        ))}
      </View>
    </>
  );
  if (!talk) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, felled.length > 0 && styles.rowFelled]}>
        {content}
      </View>
    );
  }
  return (
    <View style={[styles.rowWrap, felled.length > 0 && styles.rowFelled]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={g('dmg.talkHint')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.rowInner}
      >
        {content}
      </Pressable>
      {open && (
        <View style={styles.rowTalk}>
          <BanterChat shown={talk} avatar={24} />
        </View>
      )}
    </View>
  );
}

/** Kg that fills a whole bar for these days: the biggest figure shown, at least 0.2 kg so a quiet week is not blown up. */
function barScale(days: DamageDay[]): number {
  return Math.max(0.2, ...days.map((d) => Math.max(Math.abs(d.estKg ?? 0), Math.abs(d.realKg ?? 0))));
}

/** Days worth listing: those with logged food or a weigh-in, newest first. */
function listedDays(days: DamageDay[]): DamageDay[] {
  return days.filter((d) => d.estKg != null || d.weightKg != null).reverse();
}

/** One row of the weight log: a weigh-in, a boss's weight line (fallen or still ahead) or the start. */
function WeightRow({ row, bosses, currentKg, onOpenBoss }: { row: WeightLogRow; bosses: StageBoss[]; currentKg: number; onOpenBoss: (b: StageBoss) => void }) {
  const g = useGameText();
  if (row.kind === 'boss') {
    const boss = bosses[row.bossIndex];
    if (!boss) return null;
    const fell = row.status === 'defeated';
    const text = fell
      ? g('dmg.lineFell', { kg: row.kg, name: bossName(boss, g), date: row.dateKey ? shortDate(row.dateKey) : '' })
      : g('dmg.lineAhead', { kg: row.kg, name: bossName(boss, g), left: Math.max(0, currentKg - row.kg).toFixed(1) });
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={g('stage.open')}
        onPress={() => onOpenBoss(boss)}
        style={[styles.line, fell ? styles.lineFell : styles.lineAhead]}
      >
        <StageBossArt archetype={boss.archetype} tier={boss.tier} size={28} defeated={fell} />
        <HudText size={12} color={fell ? quest.xp : quest.hpText} style={styles.flex}>
          {text}
        </HudText>
      </Pressable>
    );
  }
  if (row.kind === 'start') {
    return (
      <View accessible style={styles.weigh}>
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
          {g('stage.start', { kg: row.kg })}
        </HudText>
        {row.dateKey && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {shortDate(row.dateKey)}
          </HudText>
        )}
      </View>
    );
  }
  const boss = row.bossIndex != null ? bosses[row.bossIndex] : undefined;
  const change = signedKg(-row.changeKg, 1);
  return (
    <View accessible style={styles.weigh}>
      <HudText size={13} style={styles.date}>
        {shortDate(row.dateKey)}
      </HudText>
      <HudText size={14} style={styles.flex}>
        {g('dmg.weigh', { kg: row.kg.toFixed(1) })}
      </HudText>
      {boss && (
        <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1} style={styles.vs}>
          {g('dmg.vs', { name: bossName(boss, g) })}
        </HudText>
      )}
      <HudText size={12} color={row.changeKg < 0 ? quest.xp : row.changeKg > 0 ? quest.hpText : quest.textSecondary} style={styles.change}>
        {change}
      </HudText>
    </View>
  );
}

interface LogProps {
  log: DamageLog;
  weightRows: WeightLogRow[];
  bosses: StageBoss[];
  currentKg: number;
  targetKcal: number;
  cheatDays: string[];
  onOpenBoss: (b: StageBoss) => void;
  /** Each day's exchange with the boss, by date key. */
  talks?: ReadonlyMap<string, BanterShown>;
}

/** The Map's damage log: estimated (deficit) against real (scale) damage per day on the stage bosses, or the weight
 *  log with each boss's weight line and when it fell. Static rows (no motion). */
export function BossDamageLog({ log, weightRows, bosses, currentKg, targetKcal, cheatDays, onOpenBoss, talks }: LogProps) {
  const g = useGameText();
  const [view, setView] = useState<LogView>('days');
  const [shown, setShown] = useState(PAGE);
  const days = listedDays(log.days);
  const visibleDays = days.slice(0, shown);
  const scale = barScale(visibleDays);
  const visibleRows = weightRows.slice(0, shown);
  const total = view === 'days' ? days.length : weightRows.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <HudText size={18} accessibilityRole="header">
          {g('dmg.title')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('dmg.hint', { kcal: KCAL_PER_KG_FAT.toLocaleString('en-US') })}
        </HudText>
      </View>
      <View style={styles.totals}>
        <View accessible accessibilityLabel={`${g('dmg.estTotal')} ${signedKg(log.estTotalKg, 1)} kg`} style={styles.total}>
          <HudText size={20} color={quest.gold}>{signedKg(log.estTotalKg, 1)}</HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${g('dmg.estTotal')} (kg)`}
          </HudText>
        </View>
        <View accessible accessibilityLabel={`${g('dmg.realTotal')} ${log.realTotalKg == null ? g('dmg.noWeigh') : `${signedKg(log.realTotalKg, 1)} kg`}`} style={styles.total}>
          <HudText size={20} color={log.realTotalKg != null && log.realTotalKg < 0 ? quest.hpText : quest.xp}>
            {log.realTotalKg == null ? '—' : signedKg(log.realTotalKg, 1)}
          </HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${g('dmg.realTotal')} (kg)`}
          </HudText>
        </View>
      </View>
      <QuestSegment<LogView>
        accessibilityLabel={g('dmg.view')}
        value={view}
        onChange={(v) => {
          setView(v);
          setShown(PAGE);
        }}
        options={[
          { value: 'days', label: g('dmg.viewDays'), icon: 'flame' },
          { value: 'weight', label: g('dmg.viewWeight'), icon: 'chart' },
        ]}
      />
      {view === 'days' &&
        (days.length === 0 ? (
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('dmg.empty')}
          </HudText>
        ) : (
          visibleDays.map((d) => (
            <DamageDayRow
              key={d.dateKey}
              day={d}
              boss={d.bossIndex != null ? bosses[d.bossIndex] : undefined}
              bosses={bosses}
              targetKcal={targetKcal}
              cheat={cheatDays.includes(d.dateKey)}
              scale={scale}
              talk={talks?.get(d.dateKey)}
            />
          ))
        ))}
      {view === 'weight' && visibleRows.map((r, i) => <WeightRow key={`${r.kind}-${i}`} row={r} bosses={bosses} currentKg={currentKg} onOpenBoss={onOpenBoss} />)}
      {shown < total && <QuestButton title={g('dmg.more')} variant="ghost" onPress={() => setShown((n) => n + PAGE)} />}
    </View>
  );
}

/** Inside a boss's detail: what the days of its fight did to it, estimated against real, and those days. */
export function BossDamagePanel({
  boss,
  damage,
  log,
  bosses,
  targetKcal,
  cheatDays,
  talks,
}: {
  boss: StageBoss;
  damage: BossDamage | undefined;
  log: DamageLog;
  bosses: StageBoss[];
  targetKcal: number;
  cheatDays: string[];
  talks?: ReadonlyMap<string, BanterShown>;
}) {
  const g = useGameText();
  const days = listedDays(log.days.filter((d) => d.bossIndex === boss.index)).slice(0, 7);
  const scale = barScale(days);
  return (
    <View style={styles.panel}>
      <HudText size={15} accessibilityRole="header">
        {g('dmg.bossTitle')}
      </HudText>
      {damage && damage.days > 0 ? (
        <>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('dmg.bossSummary', { est: signedKg(damage.estKg, 1), real: signedKg(damage.realKg, 1), logged: damage.loggedDays, days: damage.days })}
          </HudText>
          {days.map((d) => (
            <DamageDayRow key={d.dateKey} day={d} bosses={bosses} targetKcal={targetKcal} cheat={cheatDays.includes(d.dateKey)} scale={scale} talk={talks?.get(d.dateKey)} />
          ))}
        </>
      ) : (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('dmg.bossNone')}
        </HudText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, gap: 10 },
  head: { gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  totals: { flexDirection: 'row', gap: 10 },
  total: { flex: 1, padding: 12, gap: 2, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  rowFelled: { borderColor: quest.gold },
  rowWrap: { borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  rowInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10 },
  rowTalk: { paddingHorizontal: 10, paddingBottom: 10 },
  rowArt: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  barLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  barLabel: { width: 58 },
  barValue: { width: 84, textAlign: 'right' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: quest.bg, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderStyle: 'dashed' },
  lineFell: { borderColor: quest.xp, backgroundColor: quest.panel },
  lineAhead: { borderColor: quest.hp, backgroundColor: quest.bossPanel },
  weigh: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1, borderColor: quest.border },
  date: { width: 48 },
  vs: { maxWidth: 130 },
  change: { minWidth: 44, textAlign: 'right' },
  panel: { gap: 8, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
});
