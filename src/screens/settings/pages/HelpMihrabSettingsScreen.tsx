/**
 * Settings → About → Help Mihrab.
 *
 * The ways a reader who likes the app can pass it on, in one place:
 *
 *   1. A rating, where this build can give one — the App Store's review
 *      page, the Play listing, or on F-Droid and the GitHub APK both the
 *      Play listing and a GitHub star (`ratingPlaces`). Each row says
 *      where it goes, so nobody taps "rate" and lands somewhere they did
 *      not expect.
 *   2. Telling people: the system share sheet with a line and the
 *      website, which is where every way of installing it is listed —
 *      not one store's link, which half the people it reaches cannot use.
 *   3. The month's prayer-time sheet, to send or to print and hand out.
 *      It is the one thing the app makes that is useful to someone who
 *      does not have the app, and it carries the site's address, so it
 *      travels as an introduction too. The row opens the month screen
 *      already on the shareable sheet — `salaty://month?share=1`, the
 *      same in-app link anything else can use — with the month switcher
 *      and the share buttons beside it.
 *
 * "Rate Mihrab" used to be the first row of About. It moved here with the
 * other two rather than staying as a duplicate.
 */
import { Share, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../../hooks/useAppPalette';
import type { RootStackParamList } from '../../../navigation/types';
import {
  openRatingPlace,
  ratingPlaces,
  type RatingPlace,
} from '../../../polish/rateApp';
import { SALATY_WEBSITE } from '../../../config/links';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from '../SettingsGroup';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { SettingsPage } from '../SettingsPage';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';

export function HelpMihrabSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { settings, updateSettings } = usePrayerSettings();

  /**
   * One row: a GitHub star. There is no store listing for this fork yet,
   * so no Play or App Store row is offered (see rateApp.ts).
   */
  const places = ratingPlaces();
  const rateRow = (place: RatingPlace) => {
    return (
      <SettingsLinkRow
        key={place}
        testID={`help-mihrab-rate-${place}`}
        title={t('helpMihrab.rateGithub', 'Star it on GitHub')}
        help={t(
          'helpMihrab.rateGithubHelp',
          'A star on GitHub helps people looking for open-source apps find it.',
        )}
        onPress={() => {
          void openRatingPlace(place);
        }}
        accessory={
          <Text style={[styles.star, { color: palette.accent }]}>★</Text>
        }
      />
    );
  };

  const tellPeople = () => {
    const message = t('helpMihrab.shareMessage', {
      url: SALATY_WEBSITE,
      defaultValue: 'I use صلاتي for prayer times and the Quran. Have a look: {{url}}',
    });
    // `message` alone: on iOS a separate `url` is sent as a second item
    // and some apps then post the link twice.
    void Share.share({ message }).catch(() => undefined);
  };

  return (
    <SettingsPage>
      <SettingsGroup>
        <SettingsBlock>
          <Text style={[styles.intro, { color: palette.text }]}>
            {t(
              'helpMihrab.intro',
              'صلاتي grows by word of mouth. If it has been useful to you, here are three ways to pass it on.',
            )}
          </Text>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title={t('settings.rateApp', 'Rate صلاتي')}>
        {places.map(rateRow)}
      </SettingsGroup>

      <SettingsGroup title={t('helpMihrab.tellTitle', 'Tell family and friends')}>
        <SettingsLinkRow
          testID="help-mihrab-tell"
          title={t('helpMihrab.tellRow', 'Send them صلاتي')}
          help={t(
            'helpMihrab.tellRowHelp',
            "A link to صلاتي's website, which has every way to download it, sent through any app you choose.",
          )}
          onPress={tellPeople}
        />
      </SettingsGroup>

      <SettingsGroup title={t('helpMihrab.monthTitle', 'Share the prayer times')}>
        <SettingsLinkRow
          testID="help-mihrab-month"
          title={t('helpMihrab.monthRow', "This month's timetable")}
          help={t(
            'helpMihrab.monthRowHelp',
            "This month's prayer times where you are, on one page to send or print.",
          )}
          onPress={() => navigation.navigate('MonthTimes', { share: true })}
        />
      </SettingsGroup>
      {/* Its own paragraph, not the group's `footer`: a footer past 140
          characters is clamped to two lines behind a ⓘ, and the part about
          printing copies to hand out is the point of this section, not a
          detail to open. */}
      <Text style={[styles.after, { color: palette.muted }]}>
        {t(
          'helpMihrab.monthFooter',
          "Send it to the people you love, or print copies to hand out at your mosque, to family and to neighbours. Every sheet carries صلاتي's address, so whoever it reaches can find the app.",
        )}
      </Text>

      {/* The way in from Today, and the way to put it away again — from
          the page it leads to, so whoever is bothered by it finds the
          switch the first time they follow it. */}
      <SettingsGroup title={t('helpMihrab.homeTitle', 'On the Today screen')}>
        <SettingsToggleRow
          testID="help-mihrab-home-toggle"
          title={t('helpMihrab.homeToggle', 'Show the heart on Today')}
          help={t(
            'helpMihrab.homeToggleHelp',
            'The small heart beside the countdown that opens this page.',
          )}
          value={settings.showHelpMihrabOnHome}
          onValueChange={v => updateSettings({ showHelpMihrabOnHome: v })}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: TYPE.callout.fontSize, lineHeight: 22 },
  star: { fontSize: TYPE.title3.fontSize },
  // Sits where a group footer would: tucked under the card above it.
  // The group's own footer style, pulled up past the group's bottom gap.
  after: {
    fontSize: TYPE.label.fontSize,
    lineHeight: 17,
    marginTop: SPACING.sm - SPACING.xl,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xs,
  },
});
