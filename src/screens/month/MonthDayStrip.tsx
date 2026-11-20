/**
 * The Arch of Light's day strip (1.0.4): the month's days as a row of
 * cells under the month's controls — the day on show in the accent's
 * wash, today with a gold dot under it. A tap scrolls the table to the
 * day; scrolling the table moves the strip's mark with it.
 */
import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ARCH_GOLD, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import type { AppPalette } from '../../theme/appPalette';

const CELL_W = 44;
const CELL_GAP = 6;

export function MonthDayStrip({
  year,
  month,
  days,
  visibleDay,
  todayDay,
  isCurrentMonth,
  palette,
  onSelect,
}: {
  year: number;
  month: number;
  /** Days in the month on show. */
  days: number;
  /** The day at the top of the table — the strip's mark. */
  visibleDay: number;
  todayDay: number;
  isCurrentMonth: boolean;
  palette: AppPalette;
  onSelect: (day: number) => void;
}) {
  const { i18n } = useTranslation();
  const listRef = useRef<FlatList<number>>(null);
  // Keep the marked day in view as the table scrolls under it.
  useEffect(() => {
    if (visibleDay < 1 || visibleDay > days) return;
    listRef.current?.scrollToIndex({ index: visibleDay - 1, viewPosition: 0.5, animated: true });
  }, [visibleDay, days]);
  const data = Array.from({ length: days }, (_, i) => i + 1);
  return (
    <FlatList
      ref={listRef}
      data={data}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={d => String(d)}
      initialScrollIndex={Math.max(0, Math.min(visibleDay, days) - 1)}
      getItemLayout={(_, index) => ({
        length: CELL_W,
        offset: (CELL_W + CELL_GAP) * index,
        index,
      })}
      onScrollToIndexFailed={() => {}}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ width: CELL_GAP }} />}
      renderItem={({ item: day }) => {
        const isVisible = day === visibleDay;
        const isToday = isCurrentMonth && day === todayDay;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={new Date(year, month, day).toLocaleDateString(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            accessibilityState={{ selected: isVisible }}
            onPress={() => onSelect(day)}
            style={[styles.cell, isVisible && { backgroundColor: palette.accentBg }]}>
            <Text
              style={[
                styles.num,
                { color: isVisible ? palette.accent : palette.text },
                isVisible && styles.numSelected,
              ]}>
              {day}
            </Text>
            <Text style={[styles.wd, { color: palette.muted }]}>
              {new Date(year, month, day).toLocaleDateString(i18n.language, { weekday: 'narrow' })}
            </Text>
            {/* Today wears a gold dot under its weekday; other cells hold
                the same room, so the row does not jump when today is on it. */}
            <View style={[styles.todayDot, isToday && { backgroundColor: ARCH_GOLD }]} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  cell: {
    width: CELL_W,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderRadius: 12,
  },
  num: { fontSize: TYPE.body.fontSize, fontWeight: '400' },
  numSelected: { fontWeight: '700' },
  wd: { fontSize: TYPE.caption.fontSize, fontWeight: '400' },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
