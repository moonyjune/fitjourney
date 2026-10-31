import { describe, expect, it } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StageBossArt } from '../../components/quest/StageBossArt';
import type { BossArchetype } from '../stageBosses';

const ARCHETYPES: BossArchetype[] = ['sugar', 'beer', 'bubbleTea', 'noodle', 'couch', 'hotpot'];

describe('StageBossArt', () => {
  it('draws every archetype at every tier, alive and defeated, hidden from screen readers', () => {
    for (const a of ARCHETYPES) {
      for (const tier of [1, 2, 3, 4, 5]) {
        for (const defeated of [false, true]) {
          let r!: ReactTestRenderer;
          act(() => {
            r = create(<StageBossArt archetype={a} tier={tier} defeated={defeated} idle size={48} />);
          });
          const svg = r.root.findAll((n) => n.props.importantForAccessibility === 'no-hide-descendants' || n.props['aria-hidden'] === true);
          expect(svg.length).toBeGreaterThan(0);
          act(() => r.unmount());
        }
      }
    }
  });
});
