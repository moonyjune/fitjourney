import { defaultQty } from './calc';
import { lookupQuantified, type QuantifiedFood } from './dbLookup';
import { foodKey } from './remember';
import type { FoodEntry } from './types';

/**
 * A food typed by name only in Add food (no calories): the food database answers it on its own when the text names ONE
 * food it has, with or without an amount ("2 quả trứng gà", "150g cơm trắng chín", "đậu phụ"). Several foods, or a name
 * the database does not know for sure, are never guessed: the AI ("Nhập bằng chữ") is the place for those.
 */
export type DescribedFood =
  | { kind: 'match'; item: QuantifiedFood }
  | { kind: 'multiple' }
  | { kind: 'none' };

/** "phở bò, trà đá", "cơm + trứng", "bánh mì với pate", "xôi và chè": more than one food. */
const SEVERAL = /[,;+&\n]|\s(?:và|với|cùng|kèm|and|with)\s/i;

/** The one food this text names: its exact name (accents, case, brackets ignored), or failing that the only food whose name has
 *  every typed word (at least two words, so "gà" alone never picks one of many). */
function resolveName(name: string, foods: FoodEntry[]): FoodEntry | undefined {
  const key = foodKey(name);
  if (!key) return undefined;
  const exact = foods.filter((f) => foodKey(f.name) === key);
  if (exact.length > 0) return exact.length === 1 || exact.every((f) => f.id === exact[0].id) ? exact[0] : undefined;
  const words = key.split(' ');
  if (words.length < 2) return undefined;
  const hits = foods.filter((f) => {
    const own = new Set(foodKey(f.name).split(' '));
    return words.every((w) => own.has(w));
  });
  return hits.length === 1 ? hits[0] : undefined;
}

const NUMBER_FIRST = /^(\d+(?:[.,]\d+)?)\s*(.+)$/;
const NUMBER_LAST = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ỹđĐ]+)?$/;

/** The ways to split "2 quả trứng gà" / "phở bò 2" into an amount part and a name part (the name may still start with a unit). */
function splits(text: string): { amount: string; name: string; trailing: boolean }[] {
  const out: { amount: string; name: string; trailing: boolean }[] = [];
  const lead = NUMBER_FIRST.exec(text);
  if (lead) {
    const [first, ...rest] = lead[2].trim().split(/\s+/);
    if (rest.length > 0) out.push({ amount: `${lead[1]} ${first}`, name: rest.join(' '), trailing: false });
    out.push({ amount: lead[1], name: lead[2].trim(), trailing: false });
  }
  const trail = NUMBER_LAST.exec(text);
  if (trail) out.push({ amount: `${trail[2]}${trail[3] ? ` ${trail[3]}` : ''}`, name: trail[1].trim(), trailing: true });
  return out;
}

export function lookupDescribedFood(description: string, foods: FoodEntry[]): DescribedFood {
  const text = description.trim().replace(/\s+/g, ' ');
  if (!text) return { kind: 'none' };
  // A food whose own name has a comma or "với" is still one food.
  const whole = resolveName(text, foods);
  if (whole && foodKey(whole.name) === foodKey(text)) return withDefaultAmount(whole);
  if (SEVERAL.test(text)) return { kind: 'multiple' };

  // An amount typed beside the name: the database scales its figures to it (or says no when the unit does not fit the food).
  for (const s of splits(text)) {
    const food = resolveName(s.name, foods);
    if (!food) continue;
    const typed = s.trailing ? `${food.name} ${s.amount}` : `${s.amount} ${food.name}`;
    const item = lookupQuantified(typed, [food]);
    if (item) return { kind: 'match', item };
  }
  if (/\d/.test(text)) return { kind: 'none' };
  return whole ? withDefaultAmount(whole) : { kind: 'none' };
}

/** No amount typed: one portion of a counted food (1 quả, 1 bát, 1 phần), 100 g / 100 ml of a food sold by weight. */
function withDefaultAmount(food: FoodEntry): DescribedFood {
  const qty = food.auto ? 1 : defaultQty(food);
  const unit = food.auto || (food.unit !== 'g' && food.unit !== 'ml') ? '' : food.unit;
  const item = lookupQuantified(`${qty}${unit ? ` ${unit}` : ''} ${food.name}`, [food]);
  return item ? { kind: 'match', item } : { kind: 'none' };
}
