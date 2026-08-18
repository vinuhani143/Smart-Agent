import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '@/components/Chip';
import type { SearchFilters } from '@/types';

const LANGUAGES = ['Any', 'Telugu', 'Hindi', 'English', 'Tamil', 'Korean'];
const GENRES = ['Any', 'Pop', 'Melody', 'Rock', 'Hip-Hop', 'Classical'];
const MOODS = ['Any', 'Romantic', 'Chill', 'Party', 'Sad', 'Workout'];
const DURATIONS = ['any', 'short', 'medium', 'long'] as const;

interface FilterBarProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {LANGUAGES.map((language) => (
        <Chip
          key={`lang-${language}`}
          label={language === 'Any' ? 'Language' : language}
          active={(filters.language ?? 'Any') === language || (language === 'Any' && !filters.language)}
          onPress={() => onChange({ ...filters, language: language === 'Any' ? undefined : language })}
        />
      ))}
      {GENRES.map((genre) => (
        <Chip
          key={`genre-${genre}`}
          label={genre === 'Any' ? 'Genre' : genre}
          active={(filters.genre ?? 'Any') === genre || (genre === 'Any' && !filters.genre)}
          onPress={() => onChange({ ...filters, genre: genre === 'Any' ? undefined : genre })}
        />
      ))}
      {MOODS.map((mood) => (
        <Chip
          key={`mood-${mood}`}
          label={mood === 'Any' ? 'Mood' : mood}
          active={(filters.mood ?? 'Any') === mood || (mood === 'Any' && !filters.mood)}
          onPress={() => onChange({ ...filters, mood: mood === 'Any' ? undefined : mood })}
        />
      ))}
      {DURATIONS.map((duration) => (
        <Chip
          key={`dur-${duration}`}
          label={duration === 'any' ? 'Duration' : duration}
          active={(filters.duration ?? 'any') === duration}
          onPress={() => onChange({ ...filters, duration })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 4,
  },
});
