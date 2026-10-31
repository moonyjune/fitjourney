import { describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BossPortrait, DefaultBossArt, StageBossArt, type BossArtKind, type BossMood } from '../../components/quest/StageBossArt';

const KINDS: BossArtKind[] = ['blob', 'sugar', 'beer', 'bubbleTea', 'noodle', 'couch', 'hotpot', 'fried'];
const MOODS: BossMood[] = ['tempting', 'talking', 'smug', 'sulking'];

const hidden = (r: ReactTestRenderer) => r.root.findAll((n) => n.props.importantForAccessibility === 'no-hide-descendants' || n.props['aria-hidden'] === true);

describe('StageBossArt', () => {
  it('draws every kind at every tier, alive and defeated, hidden from screen readers', () => {
    for (const a of KINDS) {
      for (const tier of [1, 2, 3, 4, 5]) {
        for (const defeated of [false, true]) {
          let r!: ReactTestRenderer;
          act(() => {
            r = create(<StageBossArt archetype={a} tier={tier} defeated={defeated} idle size={48} />);
          });
          expect(hidden(r).length).toBeGreaterThan(0);
          act(() => r.unmount());
        }
      }
    }
  });

  it('draws every kind in every temptation mood, the mood face replacing its own', () => {
    for (const kind of KINDS) {
      let plain!: ReactTestRenderer;
      act(() => {
        plain = create(<BossPortrait kind={kind} tier={1} size={48} />);
      });
      const plainJson = JSON.stringify(plain.toJSON());
      for (const mood of MOODS) {
        for (const mouthOpen of [false, true]) {
          let r!: ReactTestRenderer;
          act(() => {
            r = create(<BossPortrait kind={kind} tier={1} size={48} mood={mood} mouthOpen={mouthOpen} />);
          });
          expect(hidden(r).length).toBeGreaterThan(0);
          // The side-on hotpot dragon keeps its own face; everyone else wears the mood.
          if (kind === 'hotpot') expect(JSON.stringify(r.toJSON())).toBe(plainJson);
          else expect(JSON.stringify(r.toJSON())).not.toBe(plainJson);
          act(() => r.unmount());
        }
      }
      act(() => plain.unmount());
    }
  });

  it('draws the default boss as the blob', () => {
    let a!: ReactTestRenderer;
    let b!: ReactTestRenderer;
    act(() => {
      a = create(<DefaultBossArt size={40} />);
      b = create(<BossPortrait kind="blob" tier={2} size={40} />);
    });
    expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(b.toJSON()));
    act(() => {
      a.unmount();
      b.unmount();
    });
  });
});
