import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { WaterSettings } from '../../src/components/quest/WaterSettings';
import { useGameText } from '../../src/game/strings';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { backToProfile } from '../../src/utils/backToProfile';

/** Hồ sơ › Nước uống (dialogs 35): the daily target (presets, ± 250 ml) and the drinking window; applies from today on. */
export default function WaterSettingsScreen() {
  const g = useGameText();
  useLightStatusBar();
  return (
    <ScreenTemplate title={g('rd6.set.water')} eyebrow={g('profile.title')} onBack={backToProfile}>
      <WaterSettings />
    </ScreenTemplate>
  );
}
