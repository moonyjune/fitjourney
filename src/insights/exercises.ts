/**
 * Exercise catalogue for closing the gap between the deficit you reach and the one you aim for.
 * Energy is the part burned ABOVE resting: kcal = (MET - 1) x body weight (kg) x hours. MET values are the usual
 * approximations from the Compendium of Physical Activities, not measurements.
 */
export type ExerciseUnit = 'steps' | 'min' | 'rep';
export type JointRating = 'friendly' | 'careful' | 'avoid';

export interface CatalogExercise {
  id: string;
  nameVi: string;
  nameEn: string;
  group: 'cardio' | 'strength' | 'core';
  unit: ExerciseUnit;
  /** Minutes one unit takes (one step, one minute, one repetition). */
  minPerUnit: number;
  met: number;
  /** Knee / gout friendliness. */
  joint: JointRating;
  /** Starting daily amount of the suggested bundle (0 = not in the bundle). */
  bundleQty: number;
  tipVi: string;
  tipEn: string;
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  { id: 'walk-steps', nameVi: 'Đi bộ (đếm bước, đường bằng)', nameEn: 'Walking (steps, flat)', group: 'cardio', unit: 'steps', minPerUnit: 0.009, met: 3.5, joint: 'friendly', bundleQty: 5000,
    tipVi: 'Thêm 4.000–6.000 bước/ngày, chia 3–4 lượt sau bữa. Mỗi lượt 10–15 phút sau ăn còn giúp ổn định đường huyết.', tipEn: 'Add 4,000–6,000 steps a day in 3–4 walks after meals. A 10–15 minute walk after eating also steadies blood sugar.' },
  { id: 'walk-brisk', nameVi: 'Đi bộ nhanh 5,5–6 km/h', nameEn: 'Brisk walk 5.5–6 km/h', group: 'cardio', unit: 'min', minPerUnit: 1, met: 4.3, joint: 'friendly', bundleQty: 20,
    tipVi: '20–30 phút. Nói được câu ngắn nhưng hơi hụt hơi là đúng nhịp.', tipEn: '20–30 minutes. You can say short sentences but are slightly out of breath: that is the right pace.' },
  { id: 'treadmill-incline', nameVi: 'Đi bộ máy dốc 10%, 3 km/h', nameEn: 'Treadmill walk, 10% incline, 3 km/h', group: 'cardio', unit: 'min', minPerUnit: 1, met: 6, joint: 'careful', bundleQty: 0,
    tipVi: '30–45 phút, 3–4 buổi/tuần. Giảm dốc còn 5–6% nếu gối hoặc cổ chân nhức.', tipEn: '30–45 minutes, 3–4 times a week. Lower the incline to 5–6% if knees or ankles ache.' },
  { id: 'bike', nameVi: 'Đạp xe tại chỗ (vừa sức)', nameEn: 'Stationary bike (moderate)', group: 'cardio', unit: 'min', minPerUnit: 1, met: 5, joint: 'friendly', bundleQty: 0,
    tipVi: '15–30 phút. Ít va đập, hợp ngày gối hơi căng.', tipEn: '15–30 minutes. Low impact, good on days the knees feel tight.' },
  { id: 'swim', nameVi: 'Bơi / đi bộ dưới nước', nameEn: 'Swimming / water walking', group: 'cardio', unit: 'min', minPerUnit: 1, met: 6, joint: 'friendly', bundleQty: 0,
    tipVi: '30 phút, 1–2 buổi/tuần. Nhẹ khớp nhất cho người trên 100 kg.', tipEn: '30 minutes, 1–2 times a week. The gentlest on joints for anyone over 100 kg.' },
  { id: 'stairs', nameVi: 'Leo cầu thang (đi lên chậm)', nameEn: 'Climbing stairs (slow)', group: 'cardio', unit: 'min', minPerUnit: 1, met: 4, joint: 'careful', bundleQty: 0,
    tipVi: '5–10 phút. Đi xuống bằng thang máy để giảm tải cho gối.', tipEn: '5–10 minutes. Take the lift down to spare the knees.' },
  { id: 'pushup-wall', nameVi: 'Push-up tựa tường', nameEn: 'Wall push-up', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 3.8, joint: 'friendly', bundleQty: 40,
    tipVi: '3 × 12–15. Bước khởi đầu; thân thẳng như tấm ván.', tipEn: '3 × 12–15. A starting point; keep the body straight like a board.' },
  { id: 'pushup-knee', nameVi: 'Push-up quỳ gối', nameEn: 'Knee push-up', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 4.5, joint: 'careful', bundleQty: 0,
    tipVi: '3 × 8–12. Kê gối lên khăn dày.', tipEn: '3 × 8–12. Put a thick towel under the knees.' },
  { id: 'pushup', nameVi: 'Push-up thường', nameEn: 'Standard push-up', group: 'strength', unit: 'rep', minPerUnit: 0.042, met: 8, joint: 'friendly', bundleQty: 0,
    tipVi: '3 × 5–10. Chỉ khi làm được 3 × 15 quỳ gối.', tipEn: '3 × 5–10. Only once 3 × 15 knee push-ups feel easy.' },
  { id: 'dip', nameVi: 'Chống đẩy tay ghế (dips)', nameEn: 'Chair dips', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 4, joint: 'friendly', bundleQty: 0,
    tipVi: '3 × 8–10. Ghế chắc, không trượt; vai đau thì bỏ.', tipEn: '3 × 8–10. Use a sturdy chair; skip if the shoulders hurt.' },
  { id: 'box-squat', nameVi: 'Squat ngồi xuống ghế (box squat)', nameEn: 'Box squat to a chair', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 5, joint: 'careful', bundleQty: 30,
    tipVi: '3 × 10–12. Chạm mông vào ghế rồi đứng lên; gối hướng theo mũi chân.', tipEn: '3 × 10–12. Touch the chair and stand up; knees follow the toes.' },
  { id: 'squat', nameVi: 'Squat thường', nameEn: 'Bodyweight squat', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 5.5, joint: 'avoid', bundleQty: 0,
    tipVi: '3 × 12–15. Chỉ dùng khi gối hết đau hẳn.', tipEn: '3 × 12–15. Only when the knees are fully pain-free.' },
  { id: 'lunge', nameVi: 'Lunge / chùng chân', nameEn: 'Lunge', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 5, joint: 'avoid', bundleQty: 0,
    tipVi: '3 × 8 mỗi chân. Tải lớn lên gối.', tipEn: '3 × 8 each leg. Puts a lot of load on the knees.' },
  { id: 'wall-sit', nameVi: 'Ngồi dựa tường (wall sit)', nameEn: 'Wall sit', group: 'strength', unit: 'min', minPerUnit: 1, met: 4, joint: 'careful', bundleQty: 0,
    tipVi: '3 × 20–40 giây. Góc gối 100–120°, không xuống sâu.', tipEn: '3 × 20–40 seconds. Knees at 100–120°, do not go deep.' },
  { id: 'glute-bridge', nameVi: 'Cầu mông (glute bridge)', nameEn: 'Glute bridge', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 3.5, joint: 'friendly', bundleQty: 45,
    tipVi: '3 × 15. Bảo vệ gối và lưng; siết mông 1 giây ở đỉnh.', tipEn: '3 × 15. Easy on knees and back; squeeze the glutes for a second at the top.' },
  { id: 'crunch', nameVi: 'Gập bụng (crunch)', nameEn: 'Crunch', group: 'core', unit: 'rep', minPerUnit: 0.042, met: 3.8, joint: 'friendly', bundleQty: 45,
    tipVi: '3 × 15. Chỉ nâng vai, không kéo cổ.', tipEn: '3 × 15. Lift only the shoulders; do not pull on the neck.' },
  { id: 'plank', nameVi: 'Plank (tính phút)', nameEn: 'Plank (minutes)', group: 'core', unit: 'min', minPerUnit: 1, met: 4, joint: 'friendly', bundleQty: 1.5,
    tipVi: '3 × 20–40 giây. Có thể chống gối nếu mỏi lưng.', tipEn: '3 × 20–40 seconds. Drop to the knees if the back tires.' },
  { id: 'dead-bug', nameVi: 'Dead bug', nameEn: 'Dead bug', group: 'core', unit: 'rep', minPerUnit: 0.05, met: 3, joint: 'friendly', bundleQty: 30,
    tipVi: '3 × 10. Lưng dưới luôn dính sàn.', tipEn: '3 × 10. Keep the lower back on the floor.' },
  { id: 'band-row', nameVi: 'Kéo dây kháng lực (row)', nameEn: 'Resistance-band row', group: 'strength', unit: 'rep', minPerUnit: 0.05, met: 3.5, joint: 'friendly', bundleQty: 0,
    tipVi: '3 × 12–15. Kéo khuỷu ra sau, ép bả vai.', tipEn: '3 × 12–15. Pull the elbows back and squeeze the shoulder blades.' },
  { id: 'calf-raise', nameVi: 'Nâng gót (calf raise)', nameEn: 'Calf raise', group: 'strength', unit: 'rep', minPerUnit: 0.033, met: 3, joint: 'careful', bundleQty: 0,
    tipVi: '3 × 15. Bỏ qua nếu cổ chân hoặc ngón cái đang sưng.', tipEn: '3 × 15. Skip it if the ankle or big toe is swollen.' },
  { id: 'jumping-jack', nameVi: 'Jumping jack', nameEn: 'Jumping jacks', group: 'cardio', unit: 'min', minPerUnit: 1, met: 7.7, joint: 'avoid', bundleQty: 0,
    tipVi: 'Va đập lớn với cân nặng hiện tại.', tipEn: 'High impact at the current body weight.' },
  { id: 'burpee', nameVi: 'Burpee', nameEn: 'Burpee', group: 'cardio', unit: 'rep', minPerUnit: 0.067, met: 8, joint: 'avoid', bundleQty: 0,
    tipVi: 'Để dành khi đã dưới khoảng 95 kg và khớp ổn định.', tipEn: 'Save it for when you are below about 95 kg and the joints are stable.' },
];

/** Energy burned above rest by one unit of an exercise at a body weight. */
export function kcalPerUnit(ex: Pick<CatalogExercise, 'met' | 'minPerUnit'>, weightKg: number): number {
  return ((ex.met - 1) * weightKg * ex.minPerUnit) / 60;
}

export function kcalPer10Min(ex: Pick<CatalogExercise, 'met'>, weightKg: number): number {
  return ((ex.met - 1) * weightKg * 10) / 60;
}

export interface ExercisePlan {
  /** What is missing each day to reach the deficit target (0 when already there). */
  gapKcal: number;
  /** Steps per day that would cover the whole gap by walking alone. */
  stepsToCloseGap: number;
  bundle: { exercise: CatalogExercise; qty: number; kcal: number }[];
  bundleKcal: number;
  /** Part of the gap the bundle does not cover; it has to come from food. */
  leftForFoodKcal: number;
}

export function planExercises(gapKcal: number, weightKg: number): ExercisePlan {
  const gap = Math.max(0, gapKcal);
  const walk = EXERCISE_CATALOG[0];
  const bundle = EXERCISE_CATALOG.filter((e) => e.bundleQty > 0).map((exercise) => ({
    exercise,
    qty: exercise.bundleQty,
    kcal: kcalPerUnit(exercise, weightKg) * exercise.bundleQty,
  }));
  const bundleKcal = bundle.reduce((s, b) => s + b.kcal, 0);
  return {
    gapKcal: gap,
    stepsToCloseGap: gap / kcalPerUnit(walk, weightKg),
    bundle,
    bundleKcal,
    leftForFoodKcal: Math.max(0, gap - bundleKcal),
  };
}
