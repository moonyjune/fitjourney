import { describe, expect, it } from '@jest/globals';
import { buildMealTextPrompt, cleanMealInput, DISH_RULES } from '../../../supabase/functions/_shared/mealText';

const base = { person: 'Nam 34 tuổi.', coachPrompt: '' };

describe('parse-meal-text prompt', () => {
  it('reads a dish with its details as ONE dish, with the user\'s own example', () => {
    const prompt = buildMealTextPrompt({ ...base, sentence: '1 bát bún bò, 100g thịt bò, ít đường', notes: '', photoCount: 0 });
    expect(prompt).toContain('<meal>1 bát bún bò, 100g thịt bò, ít đường</meal>');
    expect(prompt).toContain(DISH_RULES);
    expect(prompt).toContain('KHÔNG tách thêm một món "thịt bò 100g"');
    expect(prompt).toContain('"1 bát cơm, 100g thịt kho" là 2 món');
  });

  it('asks for grams / ml next to every count unit', () => {
    const prompt = buildMealTextPrompt({ ...base, sentence: '1 hộp sữa chua', notes: '', photoCount: 0 });
    expect(prompt).toMatch(/cái, phần, xuất\/suất, hộp, bát, tô, chén, ly, cốc/);
    expect(prompt).toContain('"Sữa chua 1 hộp (≈100 g)"');
    expect(prompt).toContain('amountUnit');
  });

  it('puts the notes in their own tag and says how to apply them, also for a photo alone', () => {
    const prompt = buildMealTextPrompt({ ...base, sentence: '', notes: 'không ăn nước dùng, bỏ da', photoCount: 1 });
    expect(prompt).toContain('chỉ đính kèm 1 ảnh');
    expect(prompt).toContain('<notes>không ăn nước dùng, bỏ da</notes>');
    expect(prompt).toContain('"không ăn nước dùng"/"không uống nước" → bỏ phần nước dùng');
    expect(prompt).toContain('"bỏ da" → bỏ da gà/vịt/cá: giảm chất béo');
    expect(buildMealTextPrompt({ ...base, sentence: 'phở', notes: '', photoCount: 0 })).not.toContain('<notes>');
  });

  it('keeps user text out of the tags', () => {
    expect(cleanMealInput(' <b>phở</b> ', 400)).toBe('b phở /b');
    expect(cleanMealInput('x'.repeat(500), 200)).toHaveLength(200);
    expect(cleanMealInput(42, 200)).toBe('');
  });
});
