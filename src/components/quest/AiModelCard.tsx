import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { checkModel, checkPrice, forecastPerUser, MODEL_PRESETS, PRESET_PRICES, pricingFrom, type Pricing } from '../../ai/aiSettings';
import { tokensText, usdText } from './AiUsageCard';
import type { AiDayTotal } from '../../sync/cloudSync';
import { useGameText } from '../../game/strings';
import { fetchAiSettings, saveAiSetting } from '../../sync/cloudSync';
import { quest, questFonts, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

/** AI & cost > Model: which Claude model the AI functions use, and the prices (USD per million tokens) the cost estimate uses.
 *  Saved on the server (admins only); the AI functions pick a change up within about half a minute. Empty = the server's own setting. */
export function AiModelCard({ usage, onPricing }: { usage?: AiDayTotal[] | null; onPricing?: (p: Pricing | null) => void }) {
  const g = useGameText();
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'error'>('loading');
  const [model, setModel] = useState('');
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');
  const [busy, setBusy] = useState(false);
  // What the server holds now; the costs elsewhere on the screen are only worked out again once something here differs from it.
  const [saved, setSaved] = useState({ model: '', priceIn: '', priceOut: '' });
  const pricing = pricingFrom(model, priceIn, priceOut);
  const changed = model.trim() !== saved.model || priceIn.trim() !== saved.priceIn || priceOut.trim() !== saved.priceOut;
  const forecast = pricing && usage ? forecastPerUser(usage, pricing) : null;
  useEffect(() => {
    onPricing?.(loaded === 'ready' && changed ? pricing : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, model, priceIn, priceOut, saved]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAiSettings().then((s) => {
      if (cancelled) return;
      if (!s) {
        setLoaded('error');
        return;
      }
      setModel(s.model ?? '');
      setPriceIn(s.price_in ?? '');
      setPriceOut(s.price_out ?? '');
      setSaved({ model: s.model ?? '', priceIn: s.price_in ?? '', priceOut: s.price_out ?? '' });
      setLoaded('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (busy) return;
    const m = checkModel(model);
    const pi = checkPrice(priceIn);
    const po = checkPrice(priceOut);
    if (!m.ok) return setMessage({ kind: 'bad', text: g('aiModel.badModel') });
    if (!pi.ok || !po.ok) return setMessage({ kind: 'bad', text: g('aiModel.badPrice') });
    setBusy(true);
    setMessage(null);
    for (const [key, value] of [['model', m.value], ['price_in', pi.value], ['price_out', po.value]] as const) {
      const result = await saveAiSetting(key, value);
      if (!result.ok) {
        setBusy(false);
        return setMessage({ kind: 'bad', text: g('aiModel.failed', { why: result.message }) });
      }
    }
    setBusy(false);
    setModel(m.value);
    setPriceIn(pi.value);
    setPriceOut(po.value);
    setSaved({ model: m.value, priceIn: pi.value, priceOut: po.value });
    setMessage({ kind: 'ok', text: g('aiModel.saved') });
  }

  return (
    <View style={styles.card} accessibilityLabel={g('aiModel.title')}>
      <HudText size={15}>{g('aiModel.title')}</HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('aiModel.intro')}
      </HudText>
      {loaded === 'loading' && (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('aiAdmin.loading')}
        </HudText>
      )}
      {loaded === 'error' && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {g('aiModel.loadFailed')}
        </HudText>
      )}
      {loaded === 'ready' && (
        <>
          <View style={styles.presets}>
            {MODEL_PRESETS.map((id) => {
              const selected = model.trim() === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={id}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setModel(id);
                    const ref = PRESET_PRICES[id];
                    if (ref) {
                      setPriceIn(String(ref.in));
                      setPriceOut(String(ref.out));
                    }
                    setMessage(null);
                  }}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <HudText size={12} color={selected ? quest.onGold : quest.text}>
                    {id}
                  </HudText>
                </Pressable>
              );
            })}
          </View>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('aiModel.modelLabel')}
          </HudText>
          <TextInput
            accessibilityLabel={g('aiModel.modelLabel')}
            value={model}
            onChangeText={(t) => {
              setModel(t);
              setMessage(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={g('aiModel.serverDefault')}
            placeholderTextColor={quest.textSecondary}
            style={styles.input}
          />
          <View style={styles.prices}>
            <View style={styles.price}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('aiModel.priceIn')}
              </HudText>
              <TextInput
                accessibilityLabel={g('aiModel.priceIn')}
                value={priceIn}
                onChangeText={(t) => {
                  setPriceIn(t);
                  setMessage(null);
                }}
                keyboardType="decimal-pad"
                placeholder={g('aiModel.serverDefault')}
                placeholderTextColor={quest.textSecondary}
                style={styles.input}
              />
            </View>
            <View style={styles.price}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('aiModel.priceOut')}
              </HudText>
              <TextInput
                accessibilityLabel={g('aiModel.priceOut')}
                value={priceOut}
                onChangeText={(t) => {
                  setPriceOut(t);
                  setMessage(null);
                }}
                keyboardType="decimal-pad"
                placeholder={g('aiModel.serverDefault')}
                placeholderTextColor={quest.textSecondary}
                style={styles.input}
              />
            </View>
          </View>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('aiModel.priceHint')}
          </HudText>
          <View style={styles.forecast} accessibilityLabel={g('aiModel.forecastTitle')}>
            <HudText size={13} color={quest.manaText}>
              {g('aiModel.forecastTitle')}
            </HudText>
            {!pricing ? (
              <HudText size={12} weight="medium" color={quest.hpText}>
                {g('aiModel.badPrice')}
              </HudText>
            ) : !forecast ? (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('aiModel.forecastNone')}
              </HudText>
            ) : (
              <>
                <HudText size={12} weight="medium">
                  {g('aiModel.forecastDay', { tokens: tokensText(forecast.tokensIn + forecast.tokensOut), tin: tokensText(forecast.tokensIn), tout: tokensText(forecast.tokensOut), usd: usdText(forecast.costPerDay) })}
                </HudText>
                <HudText size={12} weight="medium">
                  {g('aiModel.forecastMonth', { tokens: tokensText((forecast.tokensIn + forecast.tokensOut) * 30), usd: usdText(forecast.costPerMonth) })}
                </HudText>
                <HudText size={11} weight="medium" color={quest.textSecondary}>
                  {g('aiModel.forecastBasis', { n: forecast.userDays, days: forecast.days, pin: pricing.priceIn, pout: pricing.priceOut })}
                </HudText>
              </>
            )}
          </View>
          <QuestButton title={busy ? g('aiModel.saving') : g('aiModel.save')} onPress={() => void save()} loading={busy} />
          {message && (
            <HudText size={12} weight="medium" color={message.kind === 'ok' ? quest.manaText : quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {message.text}
            </HudText>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  input: { color: quest.text, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, fontSize: 14, fontFamily: questFonts.semibold, backgroundColor: quest.bg },
  forecast: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.panel },
  prices: { flexDirection: 'row', gap: 10 },
  price: { flex: 1, minWidth: 0, gap: 4 },
});
