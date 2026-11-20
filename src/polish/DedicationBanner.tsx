/**
 * A dedication, shown once on a fresh install.
 *
 * The first time the app runs after a fresh install — and never again —
 * a card asks the reader to pray for أبو عبيدة السعداني in his absence.
 * The words are the owner's, exactly as he gave them, and they stay in
 * Arabic in every locale: a name and a prayer are not translated.
 *
 * How a fresh install is told from an update: a phone that has run the
 * app before carries `salaty.lastSeenVersion` (stamped by the what's-new
 * sheet on every launch) or, for an install older than release notes,
 * the feature tour's flag. Either one means "this phone has run the app",
 * and the banner is stamped as seen without being shown. Only a phone
 * with neither gets the card — and the stamp waits for its dismissal, so
 * a reader who kills the app mid-way is shown it again, which is right.
 *
 * The stamp is written once and never reset by a version bump: an update
 * is not a first install. Clearing the app's data clears it, like
 * everything else.
 *
 * Shown from Home's first focus after onboarding, beside the what's-new
 * sheet — never on the same launch as it (a fresh install has no sheet
 * to show), and never before onboarding is done.
 */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { paletteForTheme } from '../theme/tokens';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import { quiet } from '../utils/quiet';

/** Written once the banner has been shown and dismissed. */
export const DEDICATION_SEEN_KEY = 'salaty.dedicationSeen';

/** The version the what's-new sheet last stamped — see ChangelogSheet. */
const LAST_SEEN_VERSION_KEY = 'salaty.lastSeenVersion';
/** The feature tour's flag, read but never written again. */
const LEGACY_TOUR_KEY = 'salaty.featureTour.v1';

/** The words, exactly as the owner gave them. Not translated. */
export const DEDICATION_TITLE = 'أبو عبيدة السعداني';
export const DEDICATION_SUBTITLE = 'دعوة في ظهر الغيب';

/**
 * True when the banner is owed: a fresh install that has never seen it.
 * False for an update (a phone that has run the app before) — and the
 * stamp is written then, so the question is never asked again.
 */
export async function pendingDedication(): Promise<boolean> {
  try {
    const [seen, lastSeen, tour] = await AsyncStorage.multiGet([
      DEDICATION_SEEN_KEY,
      LAST_SEEN_VERSION_KEY,
      LEGACY_TOUR_KEY,
    ]);
    if (seen[1] !== null) return false;
    if (lastSeen[1] !== null || tour[1] !== null) {
      // An update, not a first install: seen without being shown.
      await AsyncStorage.setItem(DEDICATION_SEEN_KEY, '1');
      return false;
    }
    return true;
  } catch (error) {
    quiet('polish/DedicationBanner', error);
    // Storage unavailable → err on the side of NOT interrupting.
    return false;
  }
}

export async function markDedicationSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(DEDICATION_SEEN_KEY, '1');
  } catch (error) {
    quiet('polish/DedicationBanner', error);
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The card itself: فجر هادئ green, a gold rule, the name large and the
 * prayer under it, one button to put it away. The text is Arabic in
 * every locale, laid out right to left whatever the reader's language.
 */
function DedicationBannerImpl({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { isDark, palette } = useAppPalette();
  const finish = useCallback(() => {
    void markDedicationSeen();
    onClose();
  }, [onClose]);

  return (
    <ResponsiveModal
      visible={visible}
      onClose={finish}
      closeLabel={t('common.close', 'Close')}>
      <View
        style={[styles.card, { backgroundColor: palette.accentSolid }]}>
        <View
          accessibilityElementsHidden
          // The gold rule: the semantic palette's warning amber, the
          // theme's gold in every theme — AppPalette carries no gold.
          style={[
            styles.rule,
            {
              backgroundColor: paletteForTheme(isDark ? 'dark' : 'light')
                .warning,
            },
          ]}
        />
        <Text
          accessibilityRole="header"
          style={[typeStyle('title1'), styles.title, { color: palette.onAccent }]}>
          {DEDICATION_TITLE}
        </Text>
        <Text style={[typeStyle('body'), styles.subtitle, { color: palette.onAccent }]}>
          {DEDICATION_SUBTITLE}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          onPress={finish}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: palette.onAccent },
            pressed ? styles.pressed : null,
          ]}>
          <Text
            style={[typeStyle('headline'), { color: palette.accentSolid }]}>
            {t('common.close', 'Close')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

export const DedicationBanner = memo(DedicationBannerImpl);

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADIUS.lg,
  },
  rule: { width: 48, height: 3, borderRadius: RADIUS.full },
  title: { textAlign: 'center', writingDirection: 'rtl' },
  subtitle: { textAlign: 'center', writingDirection: 'rtl' },
  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  pressed: { opacity: 0.7 },
});
