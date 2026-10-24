import type { ExerciseId } from './exercises';

// Stick-figure poses for the exercise illustrations. Everything is drawn in a 120 x 80 box with the
// floor at y = 70; figures face right. `hot` limbs are the muscles doing the work (drawn in gold).

type Pt = [number, number];

export interface Limb {
  pts: Pt[];
  hot?: boolean;
}

export interface Pose {
  head: Pt;
  headR?: number;
  limbs: Limb[];
}

/** Furniture and floor lines, drawn dim behind the figure. */
export interface Prop {
  pts: Pt[];
}

export interface ExercisePoses {
  props: Prop[];
  /** [start, end] positions. */
  poses: [Pose, Pose];
  labelVi: [string, string];
  labelEn: [string, string];
}

const FLOOR: Prop = { pts: [[6, 70], [114, 70]] };
const chair = (x: number, seatY = 54): Prop[] => [
  { pts: [[x, seatY], [x + 20, seatY]] },
  { pts: [[x, seatY], [x, seatY - 20]] },
  { pts: [[x, seatY], [x, 70]] },
  { pts: [[x + 20, seatY], [x + 20, 70]] },
];

export const POSES: Record<ExerciseId, ExercisePoses> = {
  chairSquat: {
    props: [FLOOR, ...chair(22)],
    poses: [
      { head: [66, 12], limbs: [{ pts: [[66, 20], [66, 40]] }, { pts: [[66, 40], [66, 55], [66, 70]], hot: true }, { pts: [[66, 24], [80, 24]] }] },
      { head: [60, 18], limbs: [{ pts: [[58, 26], [46, 50]] }, { pts: [[46, 50], [66, 52], [66, 70]], hot: true }, { pts: [[58, 28], [74, 30]] }] },
    ],
    labelVi: ['Bắt đầu', 'Chạm nhẹ ghế'],
    labelEn: ['Start', 'Touch the chair'],
  },
  wallPushup: {
    props: [{ pts: [[104, 8], [104, 70]] }, FLOOR],
    poses: [
      { head: [92, 18], limbs: [{ pts: [[44, 70], [88, 28]] , hot: false }, { pts: [[88, 28], [104, 28]], hot: true }] },
      { head: [96, 22], limbs: [{ pts: [[44, 70], [92, 32]] }, { pts: [[92, 32], [86, 40], [104, 30]], hot: true }] },
    ],
    labelVi: ['Tay thẳng', 'Ngực về tường'],
    labelEn: ['Arms straight', 'Chest to the wall'],
  },
  kneePlank: {
    props: [FLOOR],
    poses: [
      { head: [100, 40], limbs: [{ pts: [[92, 48], [58, 56], [40, 68]], hot: true }, { pts: [[40, 68], [24, 62]] }, { pts: [[92, 48], [92, 68], [106, 68]] }] },
      { head: [100, 40], limbs: [{ pts: [[92, 48], [20, 66]], hot: true }, { pts: [[92, 48], [92, 68], [106, 68]] }] },
    ],
    labelVi: ['Cấp 1 · chống gối', 'Cấp 3 · thẳng chân'],
    labelEn: ['Level 1 · on knees', 'Level 3 · straight legs'],
  },
  glutBridge: {
    props: [FLOOR],
    poses: [
      { head: [20, 64], limbs: [{ pts: [[28, 66], [56, 66]] }, { pts: [[56, 66], [74, 48], [88, 66]], hot: true }] },
      { head: [20, 64], limbs: [{ pts: [[28, 66], [58, 46]] }, { pts: [[58, 46], [80, 48], [90, 66]], hot: true }] },
    ],
    labelVi: ['Nằm, gối co', 'Đẩy hông lên'],
    labelEn: ['Lie, knees bent', 'Lift the hips'],
  },
  deadBug: {
    props: [FLOOR],
    poses: [
      { head: [18, 64], limbs: [{ pts: [[26, 66], [62, 66]] }, { pts: [[34, 64], [34, 34]], hot: true }, { pts: [[62, 66], [62, 44], [80, 44]], hot: true }] },
      { head: [18, 64], limbs: [{ pts: [[26, 66], [62, 66]] }, { pts: [[34, 64], [8, 58]], hot: true }, { pts: [[62, 66], [92, 62]], hot: true }, { pts: [[34, 64], [34, 34]] }, { pts: [[62, 66], [62, 44], [80, 44]] }] },
    ],
    labelVi: ['Tay giơ, gối co', 'Duỗi tay, chân đối diện'],
    labelEn: ['Arms up, knees bent', 'Extend opposite arm and leg'],
  },
  chairLunge: {
    props: [FLOOR, { pts: [[90, 38], [90, 70]] }, { pts: [[90, 54], [108, 54]] }],
    poses: [
      { head: [58, 14], limbs: [{ pts: [[58, 22], [58, 44]] }, { pts: [[58, 44], [58, 70]], hot: true }, { pts: [[58, 26], [90, 38]] }] },
      { head: [58, 18], limbs: [{ pts: [[58, 26], [58, 48]] }, { pts: [[58, 48], [70, 62], [70, 70]], hot: true }, { pts: [[58, 48], [44, 66], [30, 68]], hot: true }, { pts: [[58, 30], [90, 40]] }] },
    ],
    labelVi: ['Đứng, vịn ghế', 'Bước lùi, hạ gối'],
    labelEn: ['Stand, hold the chair', 'Step back, lower the knee'],
  },
  chairDip: {
    props: [FLOOR, ...chair(18)],
    poses: [
      { head: [52, 20], limbs: [{ pts: [[52, 30], [60, 52]] }, { pts: [[52, 30], [38, 54]], hot: true }, { pts: [[60, 52], [82, 50], [84, 70]] }] },
      { head: [52, 32], limbs: [{ pts: [[52, 42], [60, 62]] }, { pts: [[52, 42], [32, 46], [38, 54]], hot: true }, { pts: [[60, 62], [82, 60], [84, 70]] }] },
    ],
    labelVi: ['Tay thẳng', 'Gập khuỷu 90°'],
    labelEn: ['Arms straight', 'Elbows at 90°'],
  },
  highKnees: {
    props: [FLOOR],
    poses: [
      { head: [58, 12], limbs: [{ pts: [[58, 20], [58, 42]] }, { pts: [[58, 42], [58, 70]], hot: true }, { pts: [[58, 24], [64, 36], [64, 44]] }] },
      { head: [58, 12], limbs: [{ pts: [[58, 20], [58, 42]] }, { pts: [[58, 42], [58, 70]] }, { pts: [[58, 42], [74, 44], [74, 58]], hot: true }, { pts: [[58, 24], [70, 30]] }] },
    ],
    labelVi: ['Đứng thẳng', 'Gối ngang hông'],
    labelEn: ['Stand tall', 'Knee to hip height'],
  },
  birdDog: {
    props: [FLOOR],
    poses: [
      { head: [90, 36], limbs: [{ pts: [[82, 46], [48, 46]], hot: true }, { pts: [[82, 46], [82, 70]] }, { pts: [[48, 46], [48, 70]] }] },
      { head: [90, 36], limbs: [{ pts: [[82, 46], [48, 46]] }, { pts: [[82, 46], [112, 42]], hot: true }, { pts: [[48, 46], [10, 46]], hot: true }, { pts: [[82, 46], [82, 70]] }, { pts: [[48, 46], [48, 70]] }] },
    ],
    labelVi: ['Quỳ bốn điểm', 'Duỗi tay, chân đối diện'],
    labelEn: ['On all fours', 'Extend opposite arm and leg'],
  },
  chinTuck: {
    props: [{ pts: [[26, 64], [60, 56], [94, 64]] }],
    poses: [
      { head: [72, 28], headR: 10, limbs: [{ pts: [[60, 56], [68, 40]], hot: true }] },
      { head: [60, 28], headR: 10, limbs: [{ pts: [[60, 56], [60, 40]], hot: true }] },
    ],
    labelVi: ['Đầu chúi ra trước', 'Kéo cằm ra sau'],
    labelEn: ['Head forward', 'Chin drawn back'],
  },
};
