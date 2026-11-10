// Offline stand-in for `tempt-me` (the Hard level), used only by the Login Dev account: a fixed sample shaped like the real answer,
// clearly labelled as simulated, with no image (nothing is invented) and no web.

export const SAMPLE_LABEL = '[Mẫu Dev]';

export function sampleTemptation(now: Date): Record<string, unknown> {
  const hot = now.getMonth() >= 3 && now.getMonth() <= 8;
  return {
    name: `${SAMPLE_LABEL} ${hot ? 'Trà sữa kem cheese size L' : 'Ca cao nóng kem tươi'}`,
    emoji: hot ? '🧋' : '☕',
    whyNow: hot ? 'Dữ liệu giả lập: trời nóng, giờ này ai cũng săn trà sữa giảm giá.' : 'Dữ liệu giả lập: trời se lạnh, đồ uống nóng đang được gọi nhiều.',
    description: 'Món mẫu cho chế độ Dev, không lấy từ web.',
    pitch: 'Ly này ngọt như lời mình nói nè… chỉ một ngụm thôi, mình hứa giữ bí mật 😚',
    kcal: hot ? 480 : 320,
    sugarG: hot ? 48 : 30,
    purineMg: 10,
    imageUrl: null,
    sourceDomain: null,
    web: 'unused',
  };
}

/** Offline stand-in for `tempt-chat` (AI tương tác), Login Dev account only: an opening from the fixed sample, then a boss that insists,
 *  switches once and gives up at the last turn; every line is labelled as simulated. */
export function sampleTemptChat(body: { action: string; turn?: number }, now: Date): Record<string, unknown> {
  if (body.action === 'open') {
    const item = sampleTemptation(now);
    return { ...item, poolId: 'sample', lines: [`${SAMPLE_LABEL} Giờ này mà không có gì ngọt ngọt thì phí cả buổi, cưng nhỉ?`, `${SAMPLE_LABEL} ${String(item.pitch ?? '')}`] };
  }
  const turn = body.turn ?? 0;
  if (turn >= 4) return { move: 'concede', lines: [`${SAMPLE_LABEL} Thôi được rồi, ngươi lì quá, ta chịu thua! 🏳️`] };
  if (turn === 1) return { move: 'switch', lines: [`${SAMPLE_LABEL} Không thích món đó à? Vậy thử cái này xem!`], item: { ...sampleTemptation(new Date(now.getTime() + 180 * 86_400_000)), poolId: 'sample-2', lines: [] } };
  return { move: turn === 0 ? 'insist' : 'retry', lines: [`${SAMPLE_LABEL} Thật sự không? Một miếng thôi mà… 🥺`] };
}
