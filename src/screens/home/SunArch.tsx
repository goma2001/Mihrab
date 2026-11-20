/**
 * The Arch of Light (قوس النور, 1.0.4): the hero card of the redesign.
 *
 * A stone card carrying a semicircular arch — the sun's path across the
 * day, drawn from the real prayer times (`sunArch.ts`) — with the next
 * prayer and its live countdown under it, and the day's path as dots.
 *
 * The orb is placed by the clock, not animated: it moves when the minute
 * changes, so there is no motion to reduce (`prefers-reduced-motion`
 * has nothing to stop). The scene itself is memoised on the arch state,
 * so the countdown's every-second tick does not redraw the sky.
 */
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  ARCH_ARC_STROKE,
  ARCH_GOLD,
  ARCH_GOLD_SOFT,
  ARCH_ORB_R,
  ARCH_SKY,
  SPACING,
} from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { ARCH_STARS, archPoint, type ArchDot, type SunArchState } from './sunArch';
import { styles as heroStyles } from './todayCardStyles';
import { HOME_CARD_RADIUS } from './tokens';

/** The unit letters' size in the figures' em — mirrors UNIT_EM in HeroToday. */
const ARCH_UNIT_EM = 0.4;
/** The seconds' unit in the seconds' em — mirrors SECONDS_UNIT_EM there. */
const ARCH_SECONDS_UNIT_EM = 0.7;
/** The hair space (U+200A) between a figure and its unit letter. */
const UNIT_HAIR = '\u200A';

/** The arch scene: the sky, the arc and the orb. Memoised on the state. */
const ArchScene = memo(function ArchScene({
  state,
  width,
  height,
  rtl,
  isDark,
}: {
  state: SunArchState;
  width: number;
  height: number;
  rtl: boolean;
  isDark: boolean;
}) {
  const sky = ARCH_SKY[state.phase][isDark ? 'dark' : 'light'];
  // The arc is a half-ellipse filling the scene: its diameter the
  // scene's foot, its top a little under the scene's top so the orb at
  // the top still has room.
  const rx = width / 2 - ARCH_ORB_R - 6;
  const ry = height - ARCH_ORB_R - 6;
  const cx = width / 2;
  const arcD = `M ${cx - rx} ${height} A ${rx} ${ry} 0 0 1 ${cx + rx} ${height}`;
  const areaD = `${arcD} Z`;
  const showStars = state.phase === 'night' || state.phase === 'fajr';
  const orb = state.orb;
  const orbPoint =
    orb.kind === 'hidden' || orb.t == null
      ? null
      : archPoint(orb.t, width, height, rx, ry, rtl);
  // At dawn the sun sinks under the horizon: the disc is drawn that far
  // below it and clipped at it — see sunArchState — so it RISES rather
  // than standing whole on the line.
  const sink = orb.kind === 'sun' ? orb.under * ARCH_ORB_R * 2 : 0;
  const orbY = orbPoint ? orbPoint.y + sink : 0;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="archSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky.top} />
          <Stop offset="0.55" stopColor={sky.mid} />
          <Stop offset="1" stopColor={sky.bottom} />
        </LinearGradient>
        <ClipPath id="archClip">
          <Path d={areaD} />
        </ClipPath>
      </Defs>
      <Path d={areaD} fill="url(#archSky)" />
      {showStars
        ? ARCH_STARS.map((s, i) => (
            <Circle
              key={i}
              cx={s.x * width}
              cy={s.y * height}
              r={s.r}
              fill="#FFFFFF"
              opacity={state.phase === 'night' ? 0.9 : 0.45}
            />
          ))
        : null}
      {orbPoint && orb.kind === 'sun' ? (
        <G clipPath="url(#archClip)">
          <Circle cx={orbPoint.x} cy={orbY} r={ARCH_ORB_R * 2.2} fill={sky.glow} opacity={0.35} />
          <Circle cx={orbPoint.x} cy={orbY} r={ARCH_ORB_R} fill={sky.orb} />
        </G>
      ) : null}
      {orbPoint && orb.kind === 'moon' ? (
        <G clipPath="url(#archClip)">
          {/* A crescent: the bone disc, with a bite of the sky's mid
              colour taken out of it — clipped to the disc itself, so the
              bite paints nothing outside the moon. */}
          <ClipPath id="archMoon">
            <Circle cx={orbPoint.x} cy={orbY} r={ARCH_ORB_R} />
          </ClipPath>
          <G clipPath="url(#archMoon)">
            <Circle cx={orbPoint.x} cy={orbY} r={ARCH_ORB_R} fill={sky.orb} />
            <Circle cx={orbPoint.x + 5} cy={orbY - 3} r={ARCH_ORB_R - 2} fill={sky.mid} />
          </G>
        </G>
      ) : null}
      <Path d={arcD} stroke={sky.arc} strokeWidth={ARCH_ARC_STROKE} fill="none" />
      <Path
        d={`M ${SPACING.sm} ${height} H ${width - SPACING.sm}`}
        stroke={sky.arc}
        strokeWidth={1}
        opacity={0.6}
      />
    </Svg>
  );
});

/**
 * Day / night: a small pill in the card's top row that pins the app to
 * light or dark, whichever it is not on now. It shows what a tap brings
 * — the sun when it is dark, the moon when it is light.
 */
export function DayNightToggle({
  isDark,
  onPress,
}: {
  isDark: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.archDayNight', 'Day / night')}
      hitSlop={8}
      style={[
        styles.toggle,
        { backgroundColor: palette.controlBg, borderColor: palette.border },
      ]}>
      <Svg width={16} height={16} viewBox="0 0 16 16">
        {isDark ? (
          // The sun: a gold disc with eight rays.
          <G stroke={ARCH_GOLD} strokeWidth={1.4} strokeLinecap="round">
            <Circle cx={8} cy={8} r={3.4} fill={ARCH_GOLD} stroke="none" />
            <Path d="M8 1.2v1.8M8 13v1.8M1.2 8h1.8M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" />
          </G>
        ) : (
          // The moon: a crescent opening to the right — the outer disc
          // minus a bite of the same centre's smaller circle, both arcs
          // meeting at the two points where the circles cross.
          <Path
            d="M 11.3 3.2 A 5.8 5.8 0 1 0 11.3 12.8 A 4.9 4.9 0 0 0 11.3 3.2 Z"
            fill={palette.mutedSolid}
          />
        )}
      </Svg>
    </Pressable>
  );
}

export type SunArchProps = {
  state: SunArchState;
  /** The phase's name, already translated. */
  phaseLabel: string;
  dots: ArchDot[];
  /** The eyebrow ("Fajr in" + the Help chip), built by the hero. */
  eyebrow?: React.ReactNode;
  pieces: { h: number; m: number; s: string; hours: string | null };
  units: { hour: string; minute: string; second: string };
  showSeconds: boolean;
  countdownSize: number;
  secondsSize: number;
  /** The baseline shift the hero measured between the figures and the time. */
  atShift: number;
  onCountdownLine?: (e: {
    nativeEvent: { lines: Array<{ y: number; ascender: number }> };
  }) => void;
  onAtLine?: (e: {
    nativeEvent: { lines: Array<{ y: number; ascender: number }> };
  }) => void;
  /** The countdown figures' language, for the screen reader. */
  unitLang?: 'en-US';
  targetLabel: string;
  targetClock: string;
  rtl: boolean;
  /** Full-bleed (phone): the card grows to fill what the page leaves it. */
  fill?: boolean;
};

export function SunArch({
  state,
  phaseLabel,
  dots,
  eyebrow,
  pieces,
  units,
  showSeconds,
  countdownSize,
  secondsSize,
  atShift,
  onCountdownLine,
  onAtLine,
  unitLang,
  targetLabel,
  targetClock,
  rtl,
  fill = false,
}: SunArchProps) {
  const { t } = useTranslation();
  const { palette, isDark } = useAppPalette();
  // The scene's size, measured: the width the card gives it, and the
  // height — the card's own height when it grows to fill the page, else
  // the arch's own aspect. Until measured, the aspect stands in.
  const [archSize, setArchSize] = useState({ w: 320, h: 166 });
  const onArchLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    if (w > 0 && h > 0 && (w !== archSize.w || h !== archSize.h)) setArchSize({ w, h });
  };
  const unitStyle: TextStyle = {
    fontSize: countdownSize * ARCH_UNIT_EM,
    color: palette.muted,
  };
  const secondsUnitStyle: TextStyle = {
    fontSize: secondsSize * ARCH_SECONDS_UNIT_EM,
    color: palette.muted,
  };
  return (
    <View
      style={[
        styles.card,
        fill && styles.cardFill,
        cardEdgeStyle(palette),
        { backgroundColor: palette.card },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${phaseLabel} — ${targetLabel} ${targetClock}`}>
      {/* The phase, said once over the arch, in gold. */}
      <View style={styles.phaseRow}>
        <View style={[styles.phaseDot, { backgroundColor: isDark ? ARCH_GOLD_SOFT : ARCH_GOLD }]} />
        <Text
          style={[styles.phaseTag, { color: isDark ? ARCH_GOLD_SOFT : ARCH_GOLD }]}
          numberOfLines={1}>
          {phaseLabel}
        </Text>
      </View>
      <View onLayout={onArchLayout} style={fill ? styles.sceneFill : undefined}>
        <ArchScene state={state} width={archSize.w} height={archSize.h} rtl={rtl} isDark={isDark} />
      </View>
      {eyebrow}
      {/* The countdown: one line of text, the time at the other end — the
          same shape as the hero's, in the card's ink rather than the sky's. */}
      <View style={heroStyles.heroCountdownRow}>
        <Text
          style={[
            heroStyles.heroCountdownLine,
            { writingDirection: rtl ? 'rtl' : 'ltr' },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={2}
          accessibilityLanguage={unitLang}
          onTextLayout={onCountdownLine}>
          <Text
            style={[
              heroStyles.heroCountdown,
              { fontSize: countdownSize, color: palette.textSolid },
            ]}>
            {pieces.hours ? (
              <>
                {pieces.h}
                {UNIT_HAIR}
                <Text style={[heroStyles.heroUnit, unitStyle]}>{units.hour}</Text>
                {' '}
              </>
            ) : null}
            {pieces.m}
            {UNIT_HAIR}
            <Text style={[heroStyles.heroUnit, unitStyle]}>{units.minute}</Text>
          </Text>
          {showSeconds ? (
            <Text
              style={[
                heroStyles.heroSeconds,
                { fontSize: secondsSize, color: palette.muted },
              ]}>
              {' '}
              {pieces.s}
              {UNIT_HAIR}
              <Text style={[heroStyles.heroUnit, secondsUnitStyle]}>{units.second}</Text>
            </Text>
          ) : null}
        </Text>
        <Text
          style={[
            heroStyles.heroAt,
            { color: palette.muted, marginTop: atShift },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={2}
          accessibilityLanguage="en-US"
          onTextLayout={onAtLine}>
          {targetClock}
        </Text>
      </View>
      {/* The day's path under the arch: one dot per prayer, synced to
          now — done in the accent, the next in gold, the rest quiet. The
          prayer list below already names each prayer and its time, so the
          dots are decoration for a screen reader, not a second list. */}
      <View
        style={styles.dots}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {dots.map(dot => {
          const isNext = dot.state === 'next';
          const isDone = dot.state === 'done';
          const size = dot.secondary ? 7 : isNext ? 12 : 8;
          return (
            <View key={dot.key} style={styles.dotCell}>
              <View
                style={[
                  styles.dot,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: isNext
                      ? ARCH_GOLD
                      : isDone
                        ? palette.accentSolid
                        : 'transparent',
                    borderColor: isNext
                      ? ARCH_GOLD_SOFT
                      : isDone
                        ? palette.accentSolid
                        : palette.muted,
                    borderWidth: isNext ? 2 : 1.5,
                    opacity: dot.secondary && !isNext ? 0.7 : 1,
                  },
                ]}
              />
              <Text
                style={[
                  styles.dotLabel,
                  {
                    color: isNext
                      ? palette.text
                      : isDone
                        ? palette.muted
                        : palette.muted,
                    fontWeight: isNext ? '700' : '400',
                  },
                ]}
                numberOfLines={1}>
                {t(`prayer.${dot.key}`, dot.key).slice(0, 3)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: HOME_CARD_RADIUS,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  /** Full-bleed: the card grows, and the scene inside it takes the room. */
  cardFill: { flexGrow: 1 },
  sceneFill: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  phaseTag: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
  },
  dotCell: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  dot: {},
  dotLabel: {
    fontSize: TYPE.caption.fontSize,
    fontWeight: '400',
  },
});
