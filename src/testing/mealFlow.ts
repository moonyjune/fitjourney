import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

/** Test helpers for the meal-logging flow (app/add-food.tsx, "Ghi bữa"): step 1 input, step 2 review list, the item sheet (✎) and
 *  the meal / time sheet. Labels are the Vietnamese ones (the tests' default language). */

type Match = string | RegExp | ((label: string) => boolean);

const matches = (m: Match, label: unknown): boolean =>
  typeof label === 'string' && (typeof m === 'string' ? label === m : m instanceof RegExp ? m.test(label) : m(label));

export function findPressable(r: ReactTestRenderer, m: Match): ReactTestInstance | undefined {
  return r.root.findAll((n) => typeof n.props.onPress === 'function' && matches(m, n.props.accessibilityLabel))[0];
}

export function pressableOf(r: ReactTestRenderer, m: Match): ReactTestInstance {
  const found = findPressable(r, m);
  if (!found) throw new Error(`no pressable ${String(m)}`);
  return found;
}

export function findInput(r: ReactTestRenderer, m: Match): ReactTestInstance | undefined {
  return r.root.findAll((n) => typeof n.props.onChangeText === 'function' && matches(m, n.props.accessibilityLabel))[0];
}

export function inputOf(r: ReactTestRenderer, m: Match): ReactTestInstance {
  const found = findInput(r, m);
  if (!found) throw new Error(`no input ${String(m)}`);
  return found;
}

export async function tap(r: ReactTestRenderer, m: Match): Promise<void> {
  const node = pressableOf(r, m);
  await act(async () => {
    node.props.onPress();
  });
}

export async function typeIn(r: ReactTestRenderer, m: Match, value: string): Promise<void> {
  const node = inputOf(r, m);
  await act(async () => {
    node.props.onChangeText(value);
  });
}

/** The sticky "Lưu bữa · 740 kcal" button of the review step (any day, any total). */
export const SAVE_MEAL = /^(Lưu bữa|Save meal)/;
export const MANUAL = 'Tự nhập, không dùng AI';
export const ANALYZE = 'Phân tích bằng AI';

export async function saveMeal(r: ReactTestRenderer): Promise<void> {
  await tap(r, SAVE_MEAL);
}

export interface ItemFields {
  name?: string;
  kcal?: string;
  protein?: string;
  purine?: string;
  salt?: string;
  sugar?: string;
}

const FIELD_LABELS: Record<keyof ItemFields, string> = {
  name: 'Tên món',
  kcal: 'Calo (kcal)',
  protein: 'Đạm (g)',
  purine: 'Purine (mg)',
  salt: 'Muối (g)',
  sugar: 'Đường tự do (g)',
};

/** Types into the open item sheet and saves it ("Lưu món này"). */
export async function fillItemSheet(r: ReactTestRenderer, fields: ItemFields): Promise<void> {
  for (const key of Object.keys(fields) as (keyof ItemFields)[]) {
    const v = fields[key];
    if (v !== undefined) await typeIn(r, FIELD_LABELS[key], v);
  }
  await tap(r, 'Lưu món này');
}

/** A food typed by hand: "Tự nhập" on the input step (or "Thêm món" on the review step) opens an empty line in the sheet. */
export async function addByHand(r: ReactTestRenderer, fields: ItemFields): Promise<void> {
  const manual = findPressable(r, MANUAL) ?? findPressable(r, 'Tự nhập');
  if (manual) {
    await act(async () => {
      manual.props.onPress();
    });
  }
  if (!findInput(r, 'Tên món')) await tap(r, 'Thêm món');
  await fillItemSheet(r, fields);
}

/** ✎ on line n (1-based) of the review list, then the given figures, saved. */
export async function editItem(r: ReactTestRenderer, n: number, fields: ItemFields): Promise<void> {
  await tap(r, `Sửa món ${n}`);
  await fillItemSheet(r, fields);
}

/** The value shown in the item sheet for line n (opens it, reads, closes it without saving). */
export async function readItem(r: ReactTestRenderer, n: number): Promise<Record<keyof ItemFields, string>> {
  await tap(r, `Sửa món ${n}`);
  const out = {} as Record<keyof ItemFields, string>;
  for (const key of Object.keys(FIELD_LABELS) as (keyof ItemFields)[]) out[key] = inputOf(r, FIELD_LABELS[key]).props.value;
  await tap(r, 'Đóng');
  return out;
}

/** The meal chip's sheet: picks the meal (by its chip label, e.g. "Trưa") and optionally types a time, then "Xong". */
export async function openMealSheet(r: ReactTestRenderer): Promise<void> {
  await tap(r, /^Bữa: /);
}
