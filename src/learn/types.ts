export type LearnSection = 'basics' | 'food' | 'habit' | 'gout';
export const LEARN_SECTIONS: LearnSection[] = ['basics', 'food', 'habit', 'gout'];

/** How well supported the topic is: strong = widely agreed, medium = backed by studies with a moderate effect, limited = a small or indirect effect. */
export type Evidence = 'strong' | 'medium' | 'limited';

export interface LearnTopic {
  id: number;
  section: LearnSection;
  title: string;
  /** The explanation, one bullet per entry. */
  points: string[];
  evidence: Evidence;
}

export interface SnackSwap {
  id: number;
  /** What you crave. */
  craving: string;
  /** What to eat instead. */
  swap: string;
  portion: string;
  kcal: number;
  note?: string;
}
