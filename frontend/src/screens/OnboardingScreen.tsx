import { router } from 'expo-router';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { AppButton } from '@/components/AppButton';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { usePreferencesStore } from '@/store/preferencesStore';

const SLIDES = [
  {
    title: 'All Your Playlists in One Place',
    body: 'Search, save, and organize songs from the music services you already use.',
  },
  {
    title: 'Create Playlists Your Way',
    body: 'Build a custom mix or convert a playlist from one service to another.',
  },
  {
    title: 'Let AI Build Your Playlist',
    body: 'Describe the mood, language, or era. MusicMix finds real songs from official catalogs.',
  },
  {
    title: 'Connect Your Music Services',
    body: 'Spotify and YouTube are ready when you are. Amazon Music is Coming Soon / API access required.',
  },
];

export function OnboardingScreen() {
  const { colors } = useAppTheme();
  const complete = usePreferencesStore((state) => state.completeOnboarding);
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index] ?? SLIDES[0];
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) {
        setIndex((value) => value - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [index]);

  async function finish(): Promise<void> {
    await complete();
    router.replace('/(tabs)');
  }

  return (
    <Screen>
      <Text style={[styles.kicker, { color: colors.muted }]}>MusicMix</Text>
      <Text style={[styles.title, { color: colors.text }]}>{slide.title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{slide.body}</Text>
      {index === 3 ? (
        <View style={styles.services}>
          {['Spotify', 'YouTube', 'Amazon Music'].map((name) => (
            <View key={name} style={[styles.service, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.serviceName, { color: colors.text }]}>{name}</Text>
              <Text style={[styles.serviceStatus, { color: colors.muted }]}>
                {name === 'Amazon Music' ? 'Coming Soon / API access required' : 'Ready to connect'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((item, dot) => (
          <View
            key={item.title}
            style={[
              styles.dot,
              { backgroundColor: dot === index ? colors.accent : colors.border },
            ]}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => void finish()} accessibilityRole="button" accessibilityLabel="Skip" hitSlop={8} style={styles.skipHit}>
          <Text style={[styles.skip, { color: colors.muted }]}>Skip</Text>
        </Pressable>
        <View style={styles.flex}>
          <AppButton
            label={last ? 'Get Started' : 'Next'}
            onPress={() => {
              if (last) {
                void finish();
                return;
              }
              setIndex((value) => value + 1);
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  services: {
    gap: 10,
  },
  service: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  serviceName: {
    fontWeight: '700',
    fontSize: 16,
  },
  serviceStatus: {
    marginTop: 4,
    fontSize: 13,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  skip: {
    fontWeight: '700',
    fontSize: 16,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  skipHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
