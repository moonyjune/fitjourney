import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../sync/cloudSync', () => ({ pushUserData: jest.fn(), pushNutritionLog: jest.fn(), pushWeightEntry: jest.fn(), deleteWeightEntry: jest.fn() }));

import {
  carbLevelOf,
  compareWeighIns,
  estimateDayLoss,
  estimateDays,
  lossVarsOf,
  saltWaterOf,
  sumFatG,
  type DayLossVars,
} from '../dailyLossEstimate';
import { explainDailyLoss, fmtMass, fmtNum, fmtRange, fmtSigned } from '../dailyLossExplain';
import { formatGameText, type GameKey } from '../strings';
import { DailyLossLine } from '../../components/quest/DailyLossCard';
import { useSettingsStore } from '../../store/useSettingsStore';

const vi = (k: GameKey, p?: Record<string, string | number>) => formatGameText('vi', k, p);

function vars(over: Partial<DayLossVars> = {}): DayLossVars {
  return {
    dateKey: '2026-11-18',
    tdeeKcal: 2200,
    eatenKcal: 1100,
    burnedKcal: 0,
    deficitKcal: 1100,
    sugarG: 5,
    carbsG: null,
    saltG: 5,
    waterMl: 2000,
    proteinG: 100,
    proteinTargetG: 100,
    settled: true,
    cheat: false,
    missingMeals: 0,
    unknownItems: 0,
    ...over,
  };
}

function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}

describe('daily loss model', () => {
  it('deficit → fat at ~7,700 kcal/kg, minus what glycogen covered; a low-sugar day draws glycogen + 3× water', () => {
    const e = estimateDayLoss(vars());
    expect(e.carbLevel).toBe('low');
    expect(e.glycogenG).toBe(96); // 1100 × 0.35 / 4
    expect(e.glycogenWaterG).toBe(289);
    expect(e.fatG).toBe(93); // (1100 − 385) / 7.7
    expect(e.saltWaterG).toBe(0);
    expect(e.scaleChangeG).toBe(-478);
    expect(e.scaleLowG).toBeGreaterThan(e.scaleChangeG);
    expect(e.scaleHighG).toBeLessThan(e.scaleChangeG);
    expect(e.fatLowG).toBeLessThan(e.fatG);
    expect(e.fatHighG).toBeGreaterThan(e.fatG);
    expect(e.drivers[0].id).toBe('glycogen');
    expect(e.drivers.map((d) => d.id)).toEqual(['glycogen', 'fat', 'protein']);
    expect(e.confidence).toBe('high');
  });

  it('a small deficit with full glycogen is all fat; a normal-sugar day draws less glycogen', () => {
    expect(estimateDayLoss(vars({ deficitKcal: 200 })).fatG).toBe(26);
    expect(estimateDayLoss(vars({ deficitKcal: 200 })).glycogenG).toBe(0);
    const normal = estimateDayLoss(vars({ deficitKcal: 770, sugarG: 20 }));
    expect(normal.carbLevel).toBe('normal');
    expect(normal.glycogenG).toBe(48);
    expect(normal.fatG).toBe(75);
  });

  it('surplus → fat gained (negative); with a glycogen debt part of it refills glycogen and water first', () => {
    const full = estimateDayLoss(vars({ deficitKcal: -770, sugarG: 20 }));
    expect(full.fatG).toBe(-100);
    expect(full.drivers[0].id).toBe('fatGain');
    const refill = estimateDayLoss(vars({ deficitKcal: -770, sugarG: 20 }), 200);
    expect(refill.glycogenG).toBe(-146);
    expect(refill.glycogenWaterG).toBe(-439);
    expect(refill.fatG).toBe(-24);
    expect(refill.scaleChangeG).toBe(609);
    expect(refill.drivers[0].id).toBe('refill');
  });

  it('salt above 5 g holds water (~200 g per g, capped at 1 kg), less when drinking well; under 5 g lets some go', () => {
    expect(saltWaterOf(9, 2000)).toBe(800);
    expect(saltWaterOf(9, 1000)).toBe(1000);
    expect(saltWaterOf(9, 3000)).toBe(640);
    expect(saltWaterOf(15, 2000)).toBe(1000);
    expect(saltWaterOf(3, 2000)).toBe(-200);
    expect(saltWaterOf(0, 2000)).toBe(0);
    const e = estimateDayLoss(vars({ saltG: 9 }));
    expect(e.saltWaterG).toBe(800);
    expect(e.scaleChangeG).toBe(-478 + 800);
    expect(e.drivers[0].id).toBe('salt');
  });

  it('several low-sugar days in a row draw less glycogen each day; a sugary refeed refills it (scale up)', () => {
    const days = estimateDays([vars(), vars(), vars(), null, vars({ deficitKcal: 0, sugarG: 80 })]);
    const gly = days.map((d) => d?.glycogenG ?? null);
    expect(gly[0]).toBe(96);
    expect(gly[1]!).toBeLessThan(gly[0]!);
    expect(gly[2]!).toBeLessThan(gly[1]!);
    expect(gly[3]).toBeNull();
    expect(gly[4]!).toBeLessThan(0);
    expect(days[4]!.scaleChangeG).toBeGreaterThan(0);
    expect(days[4]!.drivers.some((d) => d.id === 'refill')).toBe(true);
    expect(sumFatG(days)).toBe(days.reduce((s, d) => s + (d?.fatG ?? 0), 0));
  });

  it('carb level: from free sugar, or total carbs when known', () => {
    expect(carbLevelOf({ sugarG: 5 })).toBe('low');
    expect(carbLevelOf({ sugarG: 30 })).toBe('normal');
    expect(carbLevelOf({ sugarG: 60 })).toBe('high');
    expect(carbLevelOf({ sugarG: 0, carbsG: 180 })).toBe('normal');
    expect(carbLevelOf({ sugarG: 0, carbsG: 80 })).toBe('low');
  });

  it('cheat day: still estimated from its own numbers, low confidence; unsettled: projected, medium', () => {
    const base = {
      dateKey: '2026-11-18',
      eatenKcal: 3000,
      burnedKcal: 0,
      deficitKcal: null,
      projectedDeficitKcal: null,
      settled: true,
      cheat: true,
      nutrients: { purineMg: 0, saltG: 8, sugarG: 70 },
      proteinG: 80,
      missingMeals: [],
      unknownItems: 0,
    };
    const v = lossVarsOf(base, { tdeeKcal: 2200, waterMl: 1500, proteinTargetG: 100 })!;
    expect(v.deficitKcal).toBe(-800);
    const e = estimateDayLoss(v);
    expect(e.fatG).toBeLessThan(0);
    expect(e.confidence).toBe('low');
    expect(lossVarsOf({ ...base, cheat: false }, { tdeeKcal: 2200, waterMl: 0, proteinTargetG: 100 })).toBeNull();
    const pending = lossVarsOf({ ...base, cheat: false, deficitKcal: 1500, projectedDeficitKcal: 900, settled: false }, { tdeeKcal: 2200, waterMl: 0, proteinTargetG: 100 })!;
    expect(pending.deficitKcal).toBe(900);
    const pe = estimateDayLoss(pending);
    expect(pe.projected).toBe(true);
    expect(pe.confidence).toBe('medium');
  });

  it('weigh-ins: real change vs the estimated days between the first and last weigh-in', () => {
    const est = estimateDays([vars({ dateKey: '2026-11-12' }), vars({ dateKey: '2026-11-13' }), vars({ dateKey: '2026-11-14' })]);
    expect(compareWeighIns([{ dateKey: '2026-11-12', weightKg: 80 }], est)).toBeNull();
    const c = compareWeighIns(
      [
        { dateKey: '2026-11-14', weightKg: 79.4 },
        { dateKey: '2026-11-12', weightKg: 80 },
      ],
      est
    )!;
    expect(c.actualKg).toBe(-0.6);
    expect(c.days).toBe(2);
    expect(c.estimatedKg).toBeCloseTo((est[0]!.scaleChangeG + est[1]!.scaleChangeG) / 1000, 1);
  });
});

describe('Vietnamese number formatting', () => {
  it('thousands with ".", decimals with ",", a real minus sign', () => {
    expect(fmtNum(1100, 'vi')).toBe('1.100');
    expect(fmtNum(1100, 'en')).toBe('1,100');
    expect(fmtNum(0.6, 'vi', 1)).toBe('0,6');
    expect(fmtSigned(-0.6, 'vi', 1)).toBe('−0,6');
    expect(fmtSigned(80, 'vi')).toBe('+80');
    expect(fmtSigned(-0.01, 'vi')).toBe('0');
    expect(fmtRange(-500, -300, 'vi')).toBe('−300…−500');
    expect(fmtRange(-300, -300, 'vi')).toBe('−300');
    expect(fmtMass(850, 'vi')).toBe('850 g');
    expect(fmtMass(1240, 'vi')).toBe('1,2 kg');
  });
});

describe('daily loss sheet content', () => {
  const v = vars({ saltG: 9, waterMl: 1200, proteinG: 60 });
  const e = estimateDayLoss(v);
  const x = explainDailyLoss({ vars: v, estimate: e, isToday: true, dayLabel: 'T4 18/11', weekFatG: 420, weighIn: { actualKg: -0.6, estimatedKg: -0.8, days: 7 }, lang: 'vi' });

  it('headline, variables table and bullets with the day’s numbers', () => {
    expect(vi(x.headline.key, x.headline.params)).toBe("Ước tính hôm nay: −93 g mỡ · cân có thể −160…+1.210 g");
    expect(x.vars.map((r) => `${vi(r.label)} ${r.value} ${r.unit}`)).toEqual([
      'TDEE 2.200 kcal',
      'Đã ăn 1.100 kcal',
      'Đốt thêm (tập) 0 kcal',
      'Thâm hụt 1.100 kcal',
      'Đường 5 g',
      'Muối 9 g',
      'Nước 1,2 L',
      'Protein 60 / 100 g',
    ]);
    const why = x.why.map((l) => vi(l.key, l.params));
    expect(why).toContain('Muối 9 g (> 5 g) → giữ thêm ~1.000 g nước, cân sáng mai có thể cao hơn dù mỡ vẫn giảm (rút đi sau 1–3 ngày)');
    expect(why).toContain('Thâm hụt 1.100 kcal: ~384 kcal lấy từ glycogen, phần còn lại ≈ 93 g mỡ (7.700 kcal ≈ 1 kg mỡ)');
    expect(why.some((l) => l.startsWith('Đường thấp (5 g) → cơ thể dùng glycogen trước: ~96 g glycogen kéo theo ~289 g nước'))).toBe(true);
    expect(why).toContain('Mới uống 1,2 L → cơ thể giữ nước muối lâu hơn');
    expect(why).toContain('Protein 60 / 100 g còn thấp → khi thâm hụt lớn, cơ thể có thể lấy cả từ cơ');
    expect(x.order).toHaveLength(3);
    expect(x.tips.map((t) => t.key)).toEqual(['loss.tip.salt', 'loss.tip.water', 'loss.tip.protein']);
    expect(vi(x.week!.key, x.week!.params)).toBe('🔥 Tuần này đã đốt ~420 g mỡ, cố lên!');
    expect(vi(x.weighIn!.key, x.weighIn!.params)).toBe('Cân thực tế: −0,6 kg / 7 ngày · ước tính −0,8 kg');
  });

  it('an unsettled day reads as dự kiến with "~"; a surplus as Dư năng lượng', () => {
    const pv = vars({ settled: false, deficitKcal: 800 });
    const p = explainDailyLoss({ vars: pv, estimate: estimateDayLoss(pv), isToday: true, dayLabel: '', lang: 'vi' });
    expect(vi(p.headline.key, p.headline.params)).toMatch(/^Dự kiến hôm nay: ~−\d+ g mỡ · cân có thể ~/);
    expect(p.vars[3].value).toBe('~800');
    expect(p.why.map((l) => l.key)).toContain('loss.why.projected');
    const sv = vars({ deficitKcal: -500, sugarG: 30 });
    const s = explainDailyLoss({ vars: sv, estimate: estimateDayLoss(sv), isToday: false, dayLabel: 'T2 16/11', lang: 'vi' });
    expect(vi(s.headline.key, s.headline.params)).toMatch(/^Ước tính T2 16\/11: \+65 g mỡ/);
    expect(`${vi(s.vars[3].label)} ${s.vars[3].value}`).toBe('Dư năng lượng 500');
    expect(s.tips.map((t) => t.key)).toContain('loss.tip.sugar');
  });

  describe('rendered', () => {
    let r: ReactTestRenderer | undefined;
    afterEach(() => {
      act(() => r?.unmount());
      r = undefined;
    });

    it('the line opens the ⓘ sheet with the table, Vì sao, Thứ tự đốt and tips', () => {
      useSettingsStore.setState({ language: 'vi' });
      act(() => {
        r = create(<DailyLossLine loss={{ vars: v, estimate: e, weekFatG: 420, weighIn: null }} isToday dayLabel="T4 18/11" />);
      });
      expect(allText(r!)).toContain('Ước tính hôm nay: −93 g mỡ');
      const line = r!.root.findAll((n) => n.props.testID === 'daily-loss' && typeof n.props.onPress === 'function')[0];
      act(() => line.props.onPress());
      const text = allText(r!);
      for (const s of ['Dữ liệu hôm nay', 'Vì sao', 'Thứ tự đốt', 'Làm gì để tối ưu', 'TDEE', '2.200', 'Muối 9 g (> 5 g)', 'Tuần này đã đốt ~420 g mỡ', 'không phải số đo hay lời khuyên y tế']) {
        expect(text).toContain(s);
      }
    });
  });
});
