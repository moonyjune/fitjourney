import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
const mockPush = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  pushUricReading: (...a: unknown[]) => mockPush(...a),
  deleteUricReading: (...a: unknown[]) => mockDelete(...a),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushNutritionLog: jest.fn(),
  pushProfile: jest.fn(),
  pushProofPhoto: jest.fn(),
}));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

import type { DiaryItem } from '../../feedback/items';
import { mentionsAlcohol } from '../../feedback/match';
import type { DayRow } from '../../insights/days';
import { thresholdsFrom } from '../../insights/thresholds';
import { toWeighs } from '../../insights/weights';
import { applyDiaryImport, parseDiaryImport } from '../../import/diaryImport';
import { resetAllLocalStores } from '../../store/resetLocalStores';
import { TARGET_RANGE, useUricStore } from '../../store/useUricStore';
import { contextFor, fromUmol, isPlausibleUmol, parseDateInput, sortReadings, summarizeReadings, toUmol, uricStatus } from '../../uric/analysis';
import { formatUricText } from '../../uric/strings';
import { DEFAULT_TARGET_UMOL, HIGH_UMOL, type UricReading } from '../../uric/types';

const th = thresholdsFrom({ targetDailyDeficitKcal: 1000, proteinTargetG: 110, limits: { purineMg: 600, saltG: 5, sugarG: 35 } });
const reading = (id: string, dateKey: string, valueUmol: number, note = ''): UricReading => ({ id, dateKey, valueUmol, note });

describe('units and plausibility', () => {
  it('converts between µmol/L and mg/dL (1 mg/dL = 59.48 µmol/L)', () => {
    expect(toUmol(6, 'mgdl')).toBeCloseTo(356.88, 6);
    expect(toUmol(457, 'umol')).toBe(457);
    expect(fromUmol(457, 'mgdl')).toBeCloseTo(7.683, 3);
    expect(fromUmol(457, 'umol')).toBe(457);
    expect(fromUmol(toUmol(7.2, 'mgdl'), 'mgdl')).toBeCloseTo(7.2, 9);
  });

  it('accepts results a blood test can give and rejects typos', () => {
    expect(isPlausibleUmol(100)).toBe(true);
    expect(isPlausibleUmol(1000)).toBe(true);
    expect(isPlausibleUmol(99)).toBe(false);
    expect(isPlausibleUmol(1001)).toBe(false);
    expect(isPlausibleUmol(NaN)).toBe(false);
    expect(isPlausibleUmol(toUmol(7.2, 'mgdl'))).toBe(true);
    expect(isPlausibleUmol(toUmol(720, 'mgdl'))).toBe(false); // typed µmol/L in the mg/dL field
  });
});

describe('status against the target', () => {
  it('is on target at or under it, above it up to 420, and high over 420', () => {
    expect(uricStatus(360, 360)).toBe('onTarget');
    expect(uricStatus(300, 360)).toBe('onTarget');
    expect(uricStatus(361, 360)).toBe('above');
    expect(uricStatus(420, 360)).toBe('above');
    expect(uricStatus(421, 360)).toBe('high');
    expect(uricStatus(457, 360)).toBe('high');
    expect(HIGH_UMOL).toBe(420);
    expect(DEFAULT_TARGET_UMOL).toBe(360);
  });

  it('never calls a reading high that is under a target the user set above 420', () => {
    expect(uricStatus(450, 480)).toBe('onTarget');
    expect(uricStatus(490, 480)).toBe('high');
  });
});

describe('summary of the tests', () => {
  const list = [reading('b', '2026-10-16', 457), reading('a', '2026-09-01', 520), reading('c', '2026-08-01', 560)];

  it('puts tests in date order and finds the latest, the one before, the changes and the gap to the target', () => {
    expect(sortReadings(list).map((r) => r.id)).toEqual(['c', 'a', 'b']);
    const s = summarizeReadings(list, 360, '2026-10-26')!;
    expect(s.latest.id).toBe('b');
    expect(s.previous?.id).toBe('a');
    expect(s.deltaVsPrevious).toBe(-63);
    expect(s.deltaVsFirst).toBe(-103);
    expect(s.daysSince).toBe(10);
    expect(s.aboveTarget).toBe(97);
    expect(s.status).toBe('high');
  });

  it('handles a single test, none, today, and a test dated after today', () => {
    expect(summarizeReadings([], 360, '2026-10-26')).toBeNull();
    const one = summarizeReadings([reading('a', '2026-10-16', 457)], 360, '2026-10-16')!;
    expect(one).toMatchObject({ previous: null, deltaVsPrevious: null, deltaVsFirst: null, daysSince: 0 });
    expect(summarizeReadings([reading('a', '2026-10-30', 300)], 360, '2026-10-26')!).toMatchObject({ daysSince: 0, aboveTarget: 0, status: 'onTarget' });
  });
});

describe('what the diary looked like before a test', () => {
  const row = (dateKey: string, over: Partial<DayRow> = {}): DayRow => ({ dateKey, kcal: 1500, proteinG: 100, purineMg: 400, sugarG: 10, sodiumMg: 2000, exerciseKcal: 0, tdee: 2500, deficit: 1000, cumDeficit: 0, complete: true, missing: [], ...over });
  const item = (dateKey: string, text: string): DiaryItem => ({ id: dateKey + text, dateKey, text, mealTime: null, kcal: 0, proteinG: 0, purineMg: 0, sugarG: 0, sodiumMg: 0 });
  const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

  it('averages the 14 days up to and including the test day and counts purine and alcohol days', () => {
    const rows = [row(day(1), { purineMg: 9999 }), row(day(3), { purineMg: 700, deficit: 500 }), row(day(10), { purineMg: 300, deficit: 1500 }), row(day(16), { purineMg: 800 }), row(day(17), { purineMg: 9999 })];
    const items = [item(day(3), '2 lon bia'), item(day(10), 'ngao hấp bia'), item(day(16), 'rượu vang'), item(day(16), 'cơm'), item(day(1), 'bia'), item(day(17), 'bia')];
    const weighs = toWeighs([{ id: 'w1', dateISO: `${day(2)}T07:00:00`, weightKg: 108 }, { id: 'w2', dateISO: `${day(15)}T07:00:00`, weightKg: 106 }, { id: 'w3', dateISO: `${day(18)}T07:00:00`, weightKg: 100 }], th);
    const ctx = contextFor(reading('u', day(16), 457), null, { rows, items, weighs, thresholds: th });
    // window = 3 Oct .. 16 Oct: days 3, 10, 16
    expect(ctx.daysWithData).toBe(3);
    expect(ctx.avgPurineMg).toBeCloseTo((700 + 300 + 800) / 3, 6);
    expect(ctx.purineOverDays).toBe(2); // 700 and 800 over 600
    expect(ctx.alcoholDays).toBe(2); // beer on the 3rd, spirits on the 16th; the dish steamed in beer does not count; day 1 and 17 are outside
    expect(ctx.avgDeficit).toBeCloseTo((500 + 1500 + 1000) / 3, 6);
    expect(ctx.weightKg).toBe(106); // the last weigh-in on or before the test day
    expect(ctx.weightChangeKg).toBeNull();
  });

  it('reports the weight change since the previous test', () => {
    const weighs = toWeighs([{ id: 'w1', dateISO: '2026-09-02T07:00:00', weightKg: 110 }, { id: 'w2', dateISO: '2026-10-15T07:00:00', weightKg: 106 }], th);
    const prev = reading('p', '2026-09-03', 520);
    const ctx = contextFor(reading('u', '2026-10-16', 457), prev, { rows: [], items: [], weighs, thresholds: th });
    expect(ctx.weightChangeKg).toBeCloseTo(-4, 9);
    expect(ctx.daysWithData).toBe(0);
    expect(ctx.avgPurineMg).toBeNull();
    expect(ctx.avgDeficit).toBeNull();
  });

  it('does not use an evening weigh-in as the body weight', () => {
    const weighs = toWeighs([{ id: 'w1', dateISO: '2026-10-15T07:00:00', weightKg: 106 }, { id: 'w2', dateISO: '2026-10-16T21:00:00', weightKg: 108, note: 'Cân tối' }], th);
    expect(contextFor(reading('u', '2026-10-16', 457), null, { rows: [], items: [], weighs, thresholds: th }).weightKg).toBe(106);
  });

  it('knows beer from a dish steamed in beer', () => {
    expect(mentionsAlcohol(['2 lon bia'])).toBe(true);
    expect(mentionsAlcohol(['ngao hấp bia'])).toBe(false);
    expect(mentionsAlcohol(['ngao hấp bia', 'bia hơi'])).toBe(true);
    expect(mentionsAlcohol(['uống Rượu'])).toBe(true);
    expect(mentionsAlcohol([])).toBe(false);
  });
});

describe('typing a date', () => {
  it('reads dd/mm/yyyy and yyyy-mm-dd, and refuses what is not a real date', () => {
    expect(parseDateInput('16/10/2026')).toBe('2026-10-16');
    expect(parseDateInput('6.1.2026')).toBe('2026-01-06');
    expect(parseDateInput(' 2026-10-16 ')).toBe('2026-10-16');
    expect(parseDateInput('29/02/2024')).toBe('2024-02-29');
    expect(parseDateInput('29/02/2026')).toBeNull();
    expect(parseDateInput('31/04/2026')).toBeNull();
    expect(parseDateInput('16/10')).toBeNull();
    expect(parseDateInput('abc')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
});

describe('uric store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUricStore.setState({ readings: [], targetUmol: DEFAULT_TARGET_UMOL });
  });
  const fields = { dateKey: '2026-10-16', valueUmol: 457, note: '  sau tiệc  ' };

  it('adds, edits and removes a reading and syncs each change', () => {
    const r = useUricStore.getState().addReading(fields);
    expect(r.id.startsWith('u-')).toBe(true);
    expect(r.note).toBe('sau tiệc');
    expect(mockPush).toHaveBeenLastCalledWith(r);
    useUricStore.getState().updateReading(r.id, { ...fields, valueUmol: 400 });
    expect(useUricStore.getState().readings[0]).toMatchObject({ id: r.id, valueUmol: 400 });
    expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({ id: r.id, valueUmol: 400 }));
    useUricStore.getState().removeReading(r.id);
    expect(useUricStore.getState().readings).toEqual([]);
    expect(mockDelete).toHaveBeenCalledWith(r.id);
  });

  it('ignores an edit or a delete of a reading that does not exist', () => {
    useUricStore.getState().updateReading('nope', fields);
    useUricStore.getState().removeReading('nope');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('keeps the target between the allowed limits', () => {
    const s = useUricStore.getState();
    s.nudgeTarget(-1);
    expect(useUricStore.getState().targetUmol).toBe(350);
    for (let i = 0; i < 50; i++) s.nudgeTarget(-1);
    expect(useUricStore.getState().targetUmol).toBe(TARGET_RANGE.min);
    for (let i = 0; i < 100; i++) s.nudgeTarget(1);
    expect(useUricStore.getState().targetUmol).toBe(TARGET_RANGE.max);
  });

  it('is cleared, target included, when the signed-in account changes', () => {
    useUricStore.getState().addReading(fields);
    useUricStore.getState().nudgeTarget(1);
    resetAllLocalStores();
    expect(useUricStore.getState()).toMatchObject({ readings: [], targetUmol: DEFAULT_TARGET_UMOL });
  });
});

describe('importing uric tests from a diary file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUricStore.setState({ readings: [], targetUmol: DEFAULT_TARGET_UMOL });
  });
  const file = (uric: unknown) => JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [], uric });
  const u = (id: string, over: Record<string, unknown> = {}) => ({ id, dateKey: '2026-10-16', valueUmol: 457, note: 'ghi chú', ...over });

  it('adds the tests, syncs them, and leaves edits alone on a second import', () => {
    const parsed = parseDiaryImport(file([u('diary-u-1')]));
    if (!parsed.ok) throw new Error('parse');
    expect(applyDiaryImport(parsed.data).uricAdded).toBe(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    useUricStore.getState().updateReading('diary-u-1', { dateKey: '2026-10-16', valueUmol: 430, note: 'sửa' });
    mockPush.mockClear();
    expect(applyDiaryImport(parsed.data).uricAdded).toBe(0);
    expect(useUricStore.getState().readings[0].valueUmol).toBe(430);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still accepts files without tests', () => {
    const parsed = parseDiaryImport(JSON.stringify({ format: 'fitjourney-diary', version: 1, weights: [], nutrition: [], workouts: [] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(applyDiaryImport(parsed.data).uricAdded).toBe(0);
  });

  it.each([
    ['an id without the diary- prefix', [u('abc')]],
    ['a bad date', [u('diary-u-1', { dateKey: '16/10/2026' })]],
    ['an implausible value', [u('diary-u-1', { valueUmol: 5 })]],
    ['a value that is not a number', [u('diary-u-1', { valueUmol: '457' })]],
    ['an overlong note', [u('diary-u-1', { note: 'x'.repeat(301) })]],
    ['a duplicate id', [u('diary-u-1'), u('diary-u-1')]],
    ['tests that are not a list', { a: 1 }],
  ])('rejects the whole file on %s', (_name, uric) => {
    expect(parseDiaryImport(file(uric))).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('copy', () => {
  it('fills placeholders in both languages', () => {
    expect(formatUricText('vi', 'ur.row', { date: '16/10/2026', v: '457' })).toBe('16/10/2026: 457 µmol/L');
    expect(formatUricText('en', 'ur.s.high')).toBe('High');
  });
});
