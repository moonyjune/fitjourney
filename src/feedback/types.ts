/** `replace` = swap it for something else ("Cần thay"), `note` = be careful ("Lưu ý"), `good` = a good choice ("Tốt"). */
export type RuleKind = 'replace' | 'note' | 'good';

export interface FoodRule {
  /** Lower-case text that triggers the rule when it appears in a food description. */
  keyword: string;
  /** Short name shown to the user ("Mì gói"). */
  short: string;
  kind: RuleKind;
  why: string;
  replaceWith: string;
  /** Times within 3 days that counts as a repeat (0 = never warn about repeats). */
  repeatAt: number;
  repeatHint: string;
  shortReplace: string;
}
