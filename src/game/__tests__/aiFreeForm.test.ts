import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chatAnswer, DAILY_QUOTA, featureConfig, modelGroupOf, quotaFrom, quotaKey } from '../../../supabase/functions/_shared/usage';
import { FEELINGS_SYSTEM, feelingsPrompt, MIN_FEELING_RECORDS } from '../../../supabase/functions/_shared/feelings';
import { chatMessages, isValidPlanShape, PLAN_TOOL, SYSTEM_PROMPT_HEADER } from '../../../supabase/functions/_shared/planChat';

const fnSource = (name: string) => readFileSync(join(__dirname, `../../../supabase/functions/${name}/index.ts`), 'utf8');

describe('weekly feelings and plan chat go through the shared AI code', () => {
  it('have their own quota, defaults 3 and 10 a day, settable in app_settings', () => {
    expect(DAILY_QUOTA.feelings).toBe(3);
    expect(DAILY_QUOTA.planchat).toBe(10);
    expect(quotaKey('feelings')).toBe('ai_quota.feelings');
    expect(quotaFrom('planchat', [{ key: 'ai_quota.planchat', value: 4 }])).toBe(4);
    expect(quotaFrom('planchat', [])).toBe(10);
  });

  it('both run on the global model (Sonnet 5.5 by default), not a feature group', () => {
    const global = { model: 'claude-sonnet-5-5', priceInPerMtok: 2, priceOutPerMtok: 10 };
    for (const f of ['feelings', 'planchat'] as const) {
      expect(modelGroupOf(f)).toBeNull();
      expect(featureConfig(global, [{ key: 'model.short', value: 'claude-haiku-5-5' }], modelGroupOf(f))).toBe(global);
    }
  });

  it('the functions use serveAi under their feature and hardcode no model or API call', () => {
    for (const [name, feature] of [
      ['analyze-weekly-feelings', 'feelings'],
      ['suggest-plan-update', 'planchat'],
    ] as const) {
      const src = fnSource(name);
      expect(src).toContain(`serveAi('${feature}'`);
      expect(src).not.toMatch(/CLAUDE_MODEL|model:\s*['"]claude-/);
      expect(src).not.toContain('api.anthropic.com');
      expect(src).not.toMatch(/tool_choice:/);
    }
  });

  it('have a usage label in both languages and on the usage card', () => {
    const strings = readFileSync(join(__dirname, '../strings.ts'), 'utf8');
    const card = readFileSync(join(__dirname, '../../components/quest/AiUsageCard.tsx'), 'utf8');
    for (const f of ['feelings', 'planchat'] as const) {
      expect(strings.match(new RegExp(`'aiUsage\\.${f}': '[^']+'`, 'g'))).toHaveLength(2);
      expect(card).toContain(`${f}: 'aiUsage.${f}'`);
    }
  });
});

describe('a free-form answer (server)', () => {
  it('joins the text blocks and lists the tool calls, skipping anything else', () => {
    const out = chatAnswer([
      { type: 'thinking', thinking: 'x' },
      { type: 'text', text: ' Chào bạn.' },
      { type: 'tool_use', name: 'propose_plan_update', input: { a: 1 } },
      { type: 'text', text: 'Xem nhé. ' },
      null,
      { type: 'tool_use', name: 'other', input: null },
    ]);
    expect(out.text).toBe('Chào bạn.\nXem nhé.');
    expect(out.toolUses).toEqual([
      { name: 'propose_plan_update', input: { a: 1 } },
      { name: 'other', input: {} },
    ]);
    expect(chatAnswer(undefined)).toEqual({ text: '', toolUses: [] });
  });
});

describe('weekly feelings prompt (server)', () => {
  it('keeps the two-part instruction and lists the week and every record', () => {
    expect(MIN_FEELING_RECORDS).toBe(3);
    expect(FEELINGS_SYSTEM).toContain('HAI phần');
    const rec = { loggedAtISO: '2026-10-27T05:00:00.000Z', cravingLevel: 4, hungerLevel: 2, mood: 'vui', workoutCondition: null, note: '' };
    const text = feelingsPrompt([rec, { ...rec, workoutCondition: 'mệt', note: 'ngủ ít' }], { avgCaloriesPerDay: 1850.4, totalWorkouts: 3, weightChangeKg: -0.46 });
    expect(text.startsWith('Số liệu tuần này: Trung bình 1850 kcal/ngày, 3 buổi tập trong tuần, thay đổi cân nặng -0.5kg.')).toBe(true);
    expect(text).toContain('thèm ăn 4/5, đói 2/5, tâm trạng vui\n');
    expect(text).toContain(', tình trạng tập mệt, ghi chú: "ngủ ít"');
    expect(feelingsPrompt([rec], { avgCaloriesPerDay: 0, totalWorkouts: 0, weightChangeKg: null })).not.toContain('cân nặng');
  });
});

describe('plan chat (server)', () => {
  it('keeps the tool and prompt the app relies on', () => {
    expect(PLAN_TOOL.name).toBe('propose_plan_update');
    expect(PLAN_TOOL.input_schema.required).toEqual(['mealTemplates', 'workoutTemplates', 'shoppingList', 'waterSchedule']);
    expect(SYSTEM_PROMPT_HEADER.endsWith('Kế hoạch hiện tại (JSON):\n')).toBe(true);
  });
  it('sends only role and text of each message', () => {
    expect(chatMessages([{ role: 'user', content: 'Đổi bữa sáng', id: 'x', proposedPlan: {} }])).toEqual([{ role: 'user', content: 'Đổi bữa sáng' }]);
  });
  it('accepts a proposed plan only with every part', () => {
    const plan = { mealTemplates: { training: [], rest: [] }, workoutTemplates: [], shoppingList: [], waterSchedule: [] };
    expect(isValidPlanShape(plan)).toBe(true);
    expect(isValidPlanShape({ ...plan, waterSchedule: undefined })).toBe(false);
    expect(isValidPlanShape({ ...plan, mealTemplates: { training: [] } })).toBe(false);
    expect(isValidPlanShape(null)).toBe(false);
  });
});
