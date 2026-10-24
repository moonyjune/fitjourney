// The home-workout library from Design/v4-fitquest/3-tap-luyen: 10 bodyweight exercises, 4 levels
// each, rotated through three groups (A/B/C). Floor, wall and one chair are the only equipment.

export type ExerciseId =
  | 'chairSquat'
  | 'wallPushup'
  | 'kneePlank'
  | 'glutBridge'
  | 'deadBug'
  | 'chairLunge'
  | 'chairDip'
  | 'highKnees'
  | 'birdDog'
  | 'chinTuck';

export type GroupId = 'A' | 'B' | 'C';
export type Level = 1 | 2 | 3 | 4;
export const MAX_LEVEL: Level = 4;
export type Unit = 'reps' | 'seconds';

export interface Prescription {
  sets: number;
  /** Reps per set, or seconds per set for `unit: 'seconds'`. */
  amount: number;
  unit: Unit;
  /** One-sided exercises (per side / per leg): the amount is done on each side. */
  perSide?: boolean;
  /** Short qualifier shown next to the level ("no chair", "hold 5 s"). */
  noteVi?: string;
  noteEn?: string;
}

interface Localized {
  vi: string;
  en: string;
}

export interface Exercise {
  id: ExerciseId;
  /** Which group rotation the exercise belongs to. The neck exercise belongs to none: it is always added. */
  group: GroupId | null;
  nameVi: string;
  nameEn: string;
  areas: Localized[];
  restSec: number;
  steps: Localized[];
  caution: Localized;
  /** Index 0 = level 1. */
  levels: [Prescription, Prescription, Prescription, Prescription];
  /** Seconds of one rep, used only to estimate how long a session takes. */
  repSec: number;
}

const L = (vi: string, en: string): Localized => ({ vi, en });

export const EXERCISES: Exercise[] = [
  {
    id: 'chairSquat',
    group: 'A',
    nameVi: 'Squat ngồi ghế',
    nameEn: 'Chair squat',
    areas: [L('Đùi', 'Thighs'), L('Mông', 'Glutes'), L('Bụng', 'Core')],
    restSec: 40,
    repSec: 3,
    steps: [
      L('Chân rộng bằng vai, mũi chân hơi mở ra ngoài.', 'Feet shoulder-width apart, toes turned slightly out.'),
      L('Đẩy mông ra sau như sắp ngồi, chạm nhẹ ghế rồi đứng lên.', 'Push your hips back as if sitting, lightly touch the chair, then stand.'),
      L('Gối đi theo hướng mũi chân, lưng thẳng, thở ra khi đứng.', 'Knees follow your toes, back straight, breathe out as you stand.'),
    ],
    caution: L('Đau gối: ngồi hẳn xuống ghế rồi mới đứng lên, giảm biên độ.', 'Knee pain: sit fully on the chair before standing, use a smaller range.'),
    levels: [
      { sets: 3, amount: 8, unit: 'reps' },
      { sets: 3, amount: 12, unit: 'reps' },
      { sets: 3, amount: 15, unit: 'reps' },
      { sets: 3, amount: 12, unit: 'reps', noteVi: 'không ghế', noteEn: 'no chair' },
    ],
  },
  {
    id: 'wallPushup',
    group: 'B',
    nameVi: 'Chống đẩy tường',
    nameEn: 'Wall push-up',
    areas: [L('Ngực', 'Chest'), L('Bắp tay sau', 'Triceps'), L('Vai', 'Shoulders')],
    restSec: 40,
    repSec: 3,
    steps: [
      L('Tay đặt lên tường ngang vai, rộng hơn vai một chút.', 'Hands on the wall at shoulder height, slightly wider than your shoulders.'),
      L('Người thẳng từ gót tới đầu, hạ ngực chạm về phía tường.', 'Body straight from heels to head, lower your chest toward the wall.'),
      L('Thở ra khi đẩy người ra. Lên cấp: chống bàn, rồi chống gối.', 'Breathe out as you push away. Progress: counter push-up, then knee push-up.'),
    ],
    caution: L('Đứng càng xa tường bài càng nặng. Bắt đầu cách tường khoảng một sải tay.', 'The further from the wall, the harder it gets. Start about an arm’s length away.'),
    levels: [
      { sets: 3, amount: 8, unit: 'reps', noteVi: 'tường', noteEn: 'wall' },
      { sets: 3, amount: 12, unit: 'reps', noteVi: 'tường', noteEn: 'wall' },
      { sets: 3, amount: 10, unit: 'reps', noteVi: 'chống bàn', noteEn: 'counter' },
      { sets: 3, amount: 8, unit: 'reps', noteVi: 'chống gối', noteEn: 'on knees' },
    ],
  },
  {
    id: 'kneePlank',
    group: 'A',
    nameVi: 'Plank chống gối',
    nameEn: 'Knee plank',
    areas: [L('Bụng', 'Core'), L('Lưng', 'Back')],
    restSec: 30,
    repSec: 1,
    steps: [
      L('Khuỷu tay đặt ngay dưới vai, cẳng tay song song.', 'Elbows right under your shoulders, forearms parallel.'),
      L('Siết bụng và mông, thân thẳng từ gối tới đầu.', 'Brace your abs and glutes, body straight from knees to head.'),
      L('Thở đều, không nín thở, mắt nhìn xuống sàn.', 'Breathe steadily, do not hold your breath, eyes on the floor.'),
    ],
    caution: L('Mỏi lưng dưới: dừng set, siết bụng mạnh hơn ở set sau.', 'Lower-back strain: stop the set and brace your abs harder next set.'),
    levels: [
      { sets: 3, amount: 15, unit: 'seconds', noteVi: 'gối', noteEn: 'knees' },
      { sets: 3, amount: 30, unit: 'seconds', noteVi: 'gối', noteEn: 'knees' },
      { sets: 3, amount: 20, unit: 'seconds', noteVi: 'thẳng', noteEn: 'straight' },
      { sets: 3, amount: 45, unit: 'seconds', noteVi: 'thẳng', noteEn: 'straight' },
    ],
  },
  {
    id: 'glutBridge',
    group: 'A',
    nameVi: 'Cầu mông',
    nameEn: 'Glute bridge',
    areas: [L('Mông', 'Glutes'), L('Đùi sau', 'Hamstrings'), L('Lưng dưới', 'Lower back')],
    restSec: 30,
    repSec: 4,
    steps: [
      L('Nằm ngửa, gối co, bàn chân đặt gần mông.', 'Lie on your back, knees bent, feet close to your hips.'),
      L('Đẩy hông lên tới khi vai, hông, gối thành đường thẳng.', 'Lift your hips until shoulders, hips and knees form a line.'),
      L('Giữ 1 giây, siết mông, hạ xuống thật chậm.', 'Hold 1 second, squeeze your glutes, lower slowly.'),
    ],
    caution: L('Không ưỡn lưng quá mức ở đỉnh. Lực đến từ mông, không phải lưng.', 'Do not over-arch at the top. The effort comes from your glutes, not your back.'),
    levels: [
      { sets: 3, amount: 10, unit: 'reps' },
      { sets: 3, amount: 15, unit: 'reps' },
      { sets: 3, amount: 20, unit: 'reps' },
      { sets: 3, amount: 10, unit: 'reps', perSide: true, noteVi: 'một chân', noteEn: 'single leg' },
    ],
  },
  {
    id: 'deadBug',
    group: 'B',
    nameVi: 'Dead bug',
    nameEn: 'Dead bug',
    areas: [L('Bụng dưới', 'Lower abs'), L('Bụng sâu', 'Deep core')],
    restSec: 30,
    repSec: 4,
    steps: [
      L('Nằm ngửa, tay thẳng lên trần, gối co vuông góc.', 'Lie on your back, arms up to the ceiling, knees bent at 90°.'),
      L('Ép lưng dưới sát sàn suốt bài tập.', 'Keep your lower back pressed to the floor throughout.'),
      L('Duỗi tay và chân đối diện thật chậm, thở ra khi duỗi.', 'Slowly extend the opposite arm and leg, breathe out as you extend.'),
    ],
    caution: L('Lưng dưới bị nhấc khỏi sàn: duỗi chân ngắn lại.', 'Lower back lifts off the floor: shorten the leg reach.'),
    levels: [
      { sets: 3, amount: 5, unit: 'reps', perSide: true },
      { sets: 3, amount: 8, unit: 'reps', perSide: true },
      { sets: 3, amount: 10, unit: 'reps', perSide: true },
      { sets: 3, amount: 12, unit: 'reps', perSide: true, noteVi: 'thật chậm', noteEn: 'very slow' },
    ],
  },
  {
    id: 'chairLunge',
    group: 'C',
    nameVi: 'Lunge lùi vịn ghế',
    nameEn: 'Supported reverse lunge',
    areas: [L('Đùi', 'Thighs'), L('Mông', 'Glutes'), L('Thăng bằng', 'Balance')],
    restSec: 40,
    repSec: 4,
    steps: [
      L('Một tay vịn lưng ghế chắc chắn.', 'One hand on a sturdy chair back.'),
      L('Bước một chân ra sau, hạ gối sau xuống gần sàn.', 'Step one foot back and lower the back knee toward the floor.'),
      L('Gối trước không vượt mũi chân, đẩy gót trước để đứng lên.', 'Front knee stays behind the toes; push through the front heel to stand.'),
    ],
    caution: L('Mất thăng bằng hoặc đau gối: bước ngắn hơn, hạ ít hơn.', 'Losing balance or knee pain: take a shorter step and lower less.'),
    levels: [
      { sets: 2, amount: 6, unit: 'reps', perSide: true },
      { sets: 3, amount: 8, unit: 'reps', perSide: true },
      { sets: 3, amount: 10, unit: 'reps', perSide: true },
      { sets: 3, amount: 10, unit: 'reps', perSide: true, noteVi: 'không vịn', noteEn: 'no support' },
    ],
  },
  {
    id: 'chairDip',
    group: 'B',
    nameVi: 'Dip ghế co gối',
    nameEn: 'Bent-knee chair dip',
    areas: [L('Bắp tay sau', 'Triceps'), L('Vai', 'Shoulders')],
    restSec: 40,
    repSec: 4,
    steps: [
      L('Dùng ghế chắc, kê sát tường.', 'Use a sturdy chair, pushed against a wall.'),
      L('Tay đặt mép ghế, gối co 90°, lưng sát mép ghế.', 'Hands on the seat edge, knees bent 90°, back close to the chair.'),
      L('Hạ người tới khi khuỷu vuông góc, không xuống sâu hơn.', 'Lower until your elbows reach a right angle, no deeper.'),
    ],
    caution: L('Đau vai: bỏ bài này, thay bằng chống đẩy tường.', 'Shoulder pain: skip this one and do wall push-ups instead.'),
    levels: [
      { sets: 2, amount: 6, unit: 'reps' },
      { sets: 3, amount: 8, unit: 'reps' },
      { sets: 3, amount: 10, unit: 'reps' },
      { sets: 3, amount: 12, unit: 'reps' },
    ],
  },
  {
    id: 'highKnees',
    group: 'C',
    nameVi: 'Nâng gối tại chỗ',
    nameEn: 'Marching knees',
    areas: [L('Đốt calo', 'Calorie burn'), L('Tim mạch', 'Cardio'), L('Bụng', 'Core')],
    restSec: 30,
    repSec: 1,
    steps: [
      L('Đi bộ tại chỗ, nâng gối lên gần ngang hông.', 'March on the spot, lifting your knees toward hip height.'),
      L('Đánh tay ngược bên với chân, giữ nhịp đều.', 'Swing the opposite arm with each leg, keep a steady rhythm.'),
      L('Không bật nhảy, chân đáp nhẹ để bảo vệ khớp gối.', 'No jumping, land softly to protect your knees.'),
    ],
    caution: L('Hụt hơi: giảm tốc độ, vẫn nói được câu ngắn là vừa sức.', 'Out of breath: slow down; being able to say a short sentence is the right effort.'),
    levels: [
      { sets: 3, amount: 30, unit: 'seconds' },
      { sets: 3, amount: 45, unit: 'seconds' },
      { sets: 3, amount: 60, unit: 'seconds' },
      { sets: 4, amount: 60, unit: 'seconds', noteVi: 'nhanh hơn', noteEn: 'faster' },
    ],
  },
  {
    id: 'birdDog',
    group: 'C',
    nameVi: 'Bird-dog',
    nameEn: 'Bird-dog',
    areas: [L('Bụng', 'Core'), L('Lưng', 'Back'), L('Thăng bằng', 'Balance')],
    restSec: 30,
    repSec: 5,
    steps: [
      L('Quỳ bốn điểm: tay dưới vai, gối dưới hông.', 'On all fours: hands under shoulders, knees under hips.'),
      L('Duỗi tay phải và chân trái cùng lúc, song song với sàn.', 'Extend the right arm and left leg together, parallel to the floor.'),
      L('Giữ 2 giây, hông không xoay, đổi bên.', 'Hold 2 seconds, hips stay square, switch sides.'),
    ],
    caution: L('Đau cổ tay: chống trên nắm tay hoặc đặt khăn gấp dưới tay.', 'Wrist pain: rest on your fists or put a folded towel under your hands.'),
    levels: [
      { sets: 3, amount: 5, unit: 'reps', perSide: true },
      { sets: 3, amount: 8, unit: 'reps', perSide: true },
      { sets: 3, amount: 10, unit: 'reps', perSide: true },
      { sets: 3, amount: 10, unit: 'reps', perSide: true, noteVi: 'giữ 3 giây', noteEn: 'hold 3 s' },
    ],
  },
  {
    id: 'chinTuck',
    group: null,
    nameVi: 'Cằm lùi',
    nameEn: 'Chin tuck',
    areas: [L('Cổ', 'Neck'), L('Tư thế', 'Posture')],
    restSec: 15,
    repSec: 5,
    steps: [
      L('Ngồi hoặc đứng thẳng, mắt nhìn thẳng phía trước.', 'Sit or stand tall, eyes straight ahead.'),
      L('Kéo cằm thẳng ra sau (không cúi xuống), như tạo “cằm đôi”.', 'Draw your chin straight back (do not nod down), as if making a double chin.'),
      L('Giữ 3 giây rồi thả. Tập được ngay tại bàn làm việc.', 'Hold 3 seconds, then release. You can do this at your desk.'),
    ],
    caution: L('Giúp cổ thẳng, gọn hơn khi nhìn nghiêng. Chóng mặt thì dừng lại.', 'Helps keep your neck straight. Stop if you feel dizzy.'),
    levels: [
      { sets: 2, amount: 8, unit: 'reps', noteVi: 'giữ 3 giây', noteEn: 'hold 3 s' },
      { sets: 2, amount: 10, unit: 'reps', noteVi: 'giữ 5 giây', noteEn: 'hold 5 s' },
      { sets: 3, amount: 10, unit: 'reps', noteVi: 'giữ 5 giây', noteEn: 'hold 5 s' },
      { sets: 3, amount: 12, unit: 'reps', noteVi: 'tay ép nhẹ', noteEn: 'light hand pressure' },
    ],
  },
];

export const EXERCISE_BY_ID: Record<ExerciseId, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e])) as Record<ExerciseId, Exercise>;

export const GROUP_ORDER: GroupId[] = ['A', 'B', 'C'];

/** Which 3 exercises each group suggests (chin tuck is appended to every session). */
export const GROUP_EXERCISES: Record<GroupId, ExerciseId[]> = {
  A: ['chairSquat', 'glutBridge', 'kneePlank'],
  B: ['wallPushup', 'chairDip', 'deadBug'],
  C: ['highKnees', 'chairLunge', 'birdDog'],
};

export const ALWAYS_EXERCISE: ExerciseId = 'chinTuck';

/** Mon A, Tue B, Wed C, Thu A, Fri B, Sat C, Sun rest — the plan board's weekly rotation.
 *  `null` means the suggested day is a rest day. */
export function suggestedGroup(date: Date): GroupId | null {
  const day = date.getDay(); // 0 = Sunday
  if (day === 0) return null;
  return GROUP_ORDER[(day - 1) % 3];
}

export function prescriptionFor(id: ExerciseId, level: Level): Prescription {
  return EXERCISE_BY_ID[id].levels[level - 1];
}

/** Total repetitions (or seconds) of one set, counting both sides for one-sided exercises. */
export function setAmountSeconds(exercise: Exercise, p: Prescription): number {
  const per = p.unit === 'seconds' ? p.amount : p.amount * exercise.repSec;
  return p.perSide ? per * 2 : per;
}

/** Rough minutes for a list of exercises at the given levels: work time plus the rests between
 *  sets and exercises. Rounded to the nearest minute, never below one. */
export function estimateMinutes(items: { id: ExerciseId; level: Level }[]): number {
  let seconds = 0;
  for (const item of items) {
    const ex = EXERCISE_BY_ID[item.id];
    const p = prescriptionFor(item.id, item.level);
    seconds += setAmountSeconds(ex, p) * p.sets + ex.restSec * p.sets;
  }
  return Math.max(1, Math.round(seconds / 60));
}

/** Calories for bodyweight circuit work at ~3.5 METs: kcal = MET × kg × hours. */
export function estimateKcal(weightKg: number, minutes: number): number {
  return Math.round((3.5 * weightKg * minutes) / 60);
}
