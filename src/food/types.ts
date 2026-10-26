export type FoodGroup =
  | 'eggDairy'
  | 'plantProtein'
  | 'poultry'
  | 'redMeat'
  | 'seafood'
  | 'processed'
  | 'starch'
  | 'soup'
  | 'vegetable'
  | 'fruit'
  | 'nuts'
  | 'seasoning'
  | 'drink'
  | 'sweet'
  | 'snack';

export const FOOD_GROUPS: FoodGroup[] = [
  'eggDairy', 'plantProtein', 'poultry', 'redMeat', 'seafood', 'processed', 'starch', 'soup', 'vegetable', 'fruit', 'nuts', 'seasoning', 'drink', 'sweet', 'snack',
];

export type FoodConfidence = 'high' | 'medium' | 'low';
export type PurineLevel = 'low' | 'medium' | 'high';

/** One food with its nutrition per 100 g (or per 100 ml for drinks and liquids). */
export interface FoodEntry {
  id: string;
  name: string;
  group: FoodGroup;
  /** What a quantity counts: 'g' / 'ml' for amounts by weight or volume, or 'quả', 'lát', 'bát'... for countable portions. */
  unit: string;
  /** Grams (or ml) in one `unit`: 1 for 'g' and 'ml'. */
  unitG: number;
  kcal: number;
  proteinG: number;
  purineMg: number;
  sugarG: number;
  sodiumMg: number;
  note?: string;
  confidence: FoodConfidence;
  /** Saved by the app from a meal the user logged (not typed into the database by hand). Its figures are for one portion, see food/remember.ts. */
  auto?: boolean;
}
