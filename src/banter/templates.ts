import type { BanterDaySummary, BanterLine, BanterMood, BanterText } from '../../supabase/functions/_shared/banter';

/**
 * The exchange of a day without the AI (AI off, offline, out of quota, failed, or simply not asked yet): built on the device from
 * the day's own numbers, so every day with food logged has a conversation. Phrases vary with a seed from the date (the same day
 * always reads the same), moves are named from the deficit, and only what the summary holds is mentioned: never a food, workout or
 * number it does not have. Boss and player alternate; nothing teases the player's body or weight.
 */

/** A stable number from a date key (and a salt), to pick phrases. */
export function seedOf(date: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T,>(list: readonly T[], seed: number): T => list[seed % list.length];
const kcalText = (n: number) => Math.round(Math.abs(n)).toLocaleString('en-US');
const B = (text: string): BanterLine => ({ speaker: 'boss', text });
const P = (text: string): BanterLine => ({ speaker: 'player', text });

const MOVES = {
  met: ['Chưởng Thâm Hụt', 'Long Quyền Thâm Hụt', 'Đại Pháp Thâm Hụt'],
  ok: ['Cú Đấm Thâm Hụt', 'Liên Hoàn Cước Thâm Hụt', 'Kiếm Pháp Thâm Hụt'],
  low: ['Cú Chọc Thâm Hụt', 'Cú Búng Tay Thâm Hụt', 'Đòn Thăm Dò'],
} as const;

/** The day's move: the deficit's strength by its level, with the real kcal. */
export function moveNameFor(s: BanterDaySummary): string {
  const tier = s.level === 'met' ? 'met' : s.level === 'ok' ? 'ok' : 'low';
  return `${pick(MOVES[tier], seedOf(s.date, 1))} ${kcalText(s.deficitKcal)} kcal`;
}

function defeatLine(s: BanterDaySummary, seed: number): BanterLine {
  return B(
    pick(
      [
        `Không thể nào… ${s.boss.name} gục ngã ở đây sao? Ngươi thắng rồi!`,
        `Ta… ta thua rồi. Đi tiếp đi, boss sau còn khó hơn ta nhiều!`,
        `Á á á! Ta tan biến đây… nhưng nhớ đấy, đồng bọn ta đang chờ ngươi!`,
      ],
      seed
    )
  );
}

function deficitDay(s: BanterDaySummary, seed: number): { lines: BanterLine[]; mood: BanterMood } {
  const move = moveNameFor(s);
  const g = Math.max(1, s.estG);
  const lines: BanterLine[] = [
    P(
      s.live
        ? pick([`Tạm thời ăn trước «${move}» đã!`, `Ngày chưa hết mà «${move}» đã tới rồi đây!`], seed)
        : pick([`Đỡ chiêu «${move}» này!`, `Nhận lấy «${move}»!`, `Hôm nay ta tung «${move}»!`], seed)
    ),
  ];
  if (s.level === 'met') {
    lines.push(
      B(
        pick(
          [
            `Áaa! Mất ${g} g mỡ một lúc… ngươi ra tay nặng thật!`,
            `${g} g mỡ?! Đòn này đau thấu xương, ta sẽ nhớ mặt ngươi!`,
            `Hự… ${g} g mỡ bay mất. Được lắm, ta bắt đầu nể ngươi rồi đấy.`,
          ],
          seed >> 3
        )
      )
    );
  } else if (s.level === 'ok') {
    lines.push(
      B(
        pick(
          [`Ui da, ${g} g mỡ. Cũng ra gì đấy, nhưng chưa đủ hạ ta đâu!`, `Mất ${g} g… Hừ, ta chịu được. Mai thử mạnh tay hơn xem?`, `Trúng ${g} g rồi, tạm chấp nhận. Lần sau đánh cho đủ đô vào!`],
          seed >> 3
        )
      )
    );
  } else {
    const target = s.targetKcal > 0 ? `${kcalText(s.targetKcal)} kcal` : 'mục tiêu';
    lines.push(B(pick([`Chỉ ${g} g thôi à? Gãi ngứa cho ta đấy hả?`, `Hihi, ${g} g mỡ. Ta còn chẳng thấy đau. ${target} đâu rồi?`], seed >> 3)));
  }

  // A second hit from what really happened: a workout, the protein target reached, or a day without junk food.
  const workout = s.workouts[0];
  const bonus = workout
    ? `Chưa hết đâu! Thêm cú đá ${workout.name}${workout.minutes > 0 ? ` ${workout.minutes} phút` : ''}!`
    : s.proteinTargetG > 0 && s.proteinG >= s.proteinTargetG
      ? `Còn ${s.proteinG} g đạm giữ cơ nữa, ta không lùi bước!`
      : s.foods.length > 0 && !s.foods.some((f) => f.junk)
        ? 'Hôm nay không một món ăn vặt nào lọt qua được ta!'
        : null;
  const crit = s.weighIn && s.weighIn.lostKg > 0 ? s.weighIn.lostKg : null;

  if (bonus) {
    lines.push(P(bonus));
    lines.push(
      s.boss.fell && !crit
        ? defeatLine(s, seed >> 5)
        : B(pick(['Hừ! Ngươi tưởng thế là xong à? Ta sẽ trả thù!', 'Khoan… ngươi còn chiêu nữa sao? Ta ghi sổ rồi đấy!', 'Được lắm. Mai ta mang đồng bọn trà sữa tới!'], seed >> 5))
    );
  }
  if (crit) {
    lines.push(P(`Cân hôm nay còn báo −${crit.toFixed(1)} kg. Đòn chí mạng!`));
    lines.push(s.boss.fell ? defeatLine(s, seed >> 7) : B(pick(['Chí mạng thật… ta phải rút lui dưỡng thương.', 'Cả cái cân cũng phản ta sao?! Đau quá!'], seed >> 7)));
  }
  if (!bonus && !crit) {
    lines.push(P(pick(['Mai ta lại tới, chuẩn bị tinh thần đi!', 'Đây mới là khởi động thôi.', 'Cứ đứng yên đấy, ta quay lại ngay.'], seed >> 5)));
    if (s.boss.fell) lines.push(defeatLine(s, seed >> 7));
  }
  const mood: BanterMood = s.boss.fell ? 'defeated' : crit || s.level === 'met' ? 'hurt' : s.level === 'ok' ? 'angry' : 'smug';
  return { lines, mood };
}

function surplusDay(s: BanterDaySummary, seed: number): { lines: BanterLine[]; mood: BanterMood; moveName: string } {
  const healed = Math.max(0, -s.estG);
  const over = kcalText(s.deficitKcal);
  const food = s.foods.find((f) => f.junk) ?? s.foods[0];
  const target = s.targetKcal > 0 ? `${kcalText(s.targetKcal)} kcal` : 'đủ mục tiêu';
  const lines: BanterLine[] = [];
  let moveName: string;
  let mood: BanterMood;

  if (s.cheatDay) {
    moveName = 'Tiệc Xả Có Kế Hoạch';
    mood = 'chill';
    lines.push(B(pick([`Ngày xả có kế hoạch à? Được, hôm nay ta cho ngươi nghỉ${healed > 0 ? `, ${healed} g máu coi như quà` : ''}.`, `Ồ, ngày xả! Ta cũng thích tiệc tùng${healed > 0 ? `, cảm ơn ${healed} g máu nhé` : ''}.`], seed)));
    lines.push(P(pick(['Xả đúng kế hoạch, mai quay lại đúng lịch!', 'Ăn vui một bữa thôi, mai ta lại lên đường.'], seed >> 3)));
    lines.push(B(pick(['Ăn ngon nhé. Mai gặp lại trên chiến trường!', `Nghỉ đi. Mai ta chờ ngươi thâm hụt ${target} đấy.`], seed >> 5)));
  } else {
    moveName = food ? pick([`Hồi Máu ${food.name}`, `Bùa Mê ${food.name}`], seed >> 1) : `Hồi Máu ${over} kcal`;
    mood = 'smug';
    const heal = healed > 0 ? `${healed} g máu` : 'chút máu';
    lines.push(
      B(
        s.deficitKcal < 0
          ? pick([`Hê hê, dư ${over} kcal! Ta hồi ${heal} rồi nhé!`, `Ồ, ${over} kcal dư! ${heal} chảy ngược về ta, sướng ghê!`, `Cảm ơn ${over} kcal dư nhé, ta khoẻ lại ${heal} rồi!`], seed)
          : pick([`Hôm nay chẳng thâm hụt được mấy (${over} kcal), ta đứng yên không xi nhê!`, `Có ${over} kcal thâm hụt thôi á? Ta còn chẳng thấy gì!`], seed)
      )
    );
    lines.push(P(pick(['Cứ cười đi, hôm nay ta chỉ đang nghỉ lấy sức.', 'Một ngày thôi. Đừng tưởng bở!', 'Ghi nhận. Mai tính sổ với ngươi.'], seed >> 3)));
    lines.push(
      B(
        s.live
          ? pick(['Ngày còn chưa hết đâu, xem ngươi gỡ lại được không!', 'Còn kịp gỡ đấy, nhưng ta cá là ngươi không gỡ nổi!'], seed >> 5)
          : `${food ? `${food.name} ngon chứ? ` : ''}${pick([`Mai ngươi có dám thâm hụt ${target} không? Ta cá là không!`, `Mai thâm hụt ${target} thì hẵng nói chuyện với ta!`], seed >> 5)}`
      )
    );
  }

  const crit = s.weighIn && s.weighIn.lostKg > 0 ? s.weighIn.lostKg : null;
  if (crit) {
    lines.push(P(`Nhưng cân hôm nay vẫn báo −${crit.toFixed(1)} kg nhé!`));
    lines.push(s.boss.fell ? defeatLine(s, seed >> 7) : B('Hừ… may cho ngươi thôi! Lần sau không dễ thế đâu.'));
    mood = s.boss.fell ? 'defeated' : 'angry';
  } else if (s.boss.fell) {
    lines.push(P('Ăn thì ăn, nhưng vạch cân hôm nay ta vẫn vượt qua!'));
    lines.push(defeatLine(s, seed >> 7));
    mood = 'defeated';
  }
  return { lines, mood, moveName };
}

/** The template exchange of a day. A day with a calorie deficit is the player's move; a surplus (or a near-zero deficit) is the
 *  boss healing and taunting. */
export function templateBanter(s: BanterDaySummary): BanterText {
  const seed = seedOf(s.date);
  if (s.deficitKcal > 0 && !(s.cheatDay && s.level === 'cheat') && s.level !== 'over') {
    const { lines, mood } = deficitDay(s, seed);
    return { moveName: moveNameFor(s), mood, lines };
  }
  const { lines, mood, moveName } = surplusDay(s, seed);
  return { moveName, mood, lines };
}
