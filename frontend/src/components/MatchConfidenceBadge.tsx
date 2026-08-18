import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { confidenceBand, confidenceIcon, confidenceLabel, type ConfidenceBand } from '@/utils/matchConfidence';

export function MatchConfidenceBadge({
  status,
  confidence,
}: {
  status: string;
  confidence: number;
}) {
  const { colors } = useAppTheme();
  const band = confidenceBand(status, confidence);
  const tone = toneFor(band, colors);
  return (
    <View
      style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityLabel={`${confidenceLabel(band)}. Confidence ${confidence} percent`}
    >
      <Text style={[styles.mark, { color: tone.fg }]}>
        {confidenceIcon(band)} {confidenceLabel(band)}
      </Text>
      <Text style={[styles.score, { color: tone.fg }]}>{confidence}%</Text>
    </View>
  );
}

function toneFor(band: ConfidenceBand, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (band === 'high') {
    return { bg: colors.accentMuted, border: colors.success, fg: colors.success };
  }
  if (band === 'medium') {
    return { bg: colors.elevated, border: colors.warning, fg: colors.warning };
  }
  if (band === 'not_found') {
    return { bg: colors.elevated, border: colors.danger, fg: colors.danger };
  }
  return { bg: colors.elevated, border: colors.warning, fg: colors.warning };
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  mark: {
    fontWeight: '800',
    fontSize: 12,
  },
  score: {
    fontSize: 12,
    fontWeight: '700',
  },
});
