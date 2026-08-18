import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';
import { isAmazonMusicLive, providerDisplayName } from '@/constants/providers';
import { useCreatePlaylist } from '@/hooks/usePlaylists';
import { useProviders } from '@/hooks/useProviders';
import type { ProviderId } from '@/types';
import { toUserMessage } from '@/utils/errors';

const PROVIDERS: ProviderId[] = ['spotify', 'youtube', 'amazon_music'];

export function CreatePlaylistScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [duration, setDuration] = useState('');
  const [provider, setProvider] = useState<ProviderId>('spotify');
  const create = useCreatePlaylist();
  const providers = useProviders();
  const amazonLive = isAmazonMusicLive(providers.data?.providers);
  const selected = providers.data?.providers.find((item) => item.id === provider);

  return (
    <Screen>
      <Text style={styles.title}>Create Playlist</Text>
      <TextInput label="Playlist Name" value={name} onChangeText={setName} style={styles.input} />
      <TextInput
        label="Description"
        value={description}
        onChangeText={setDescription}
        style={styles.input}
        multiline
      />
      <TextInput label="Language" value={language} onChangeText={setLanguage} style={styles.input} />
      <TextInput label="Genre" value={genre} onChangeText={setGenre} style={styles.input} />
      <TextInput label="Mood" value={mood} onChangeText={setMood} style={styles.input} />
      <View style={styles.row}>
        <TextInput
          label="Year From"
          value={yearFrom}
          onChangeText={setYearFrom}
          style={[styles.input, styles.flex]}
          keyboardType="number-pad"
        />
        <TextInput
          label="Year To"
          value={yearTo}
          onChangeText={setYearTo}
          style={[styles.input, styles.flex]}
          keyboardType="number-pad"
        />
      </View>
      <TextInput
        label="Duration (minutes)"
        value={duration}
        onChangeText={setDuration}
        style={styles.input}
        keyboardType="number-pad"
      />

      <Text style={styles.section}>Provider selection</Text>
      <View style={styles.row}>
        {PROVIDERS.map((id) => {
          const disabled = id === 'amazon_music' && !amazonLive;
          return (
            <Button
              key={id}
              mode={provider === id ? 'contained' : 'outlined'}
              onPress={() => {
                if (!disabled) {
                  setProvider(id);
                }
              }}
              disabled={disabled}
              compact
            >
              {disabled ? 'Amazon Music — Coming Soon' : providerDisplayName(id)}
            </Button>
          );
        })}
      </View>
      {selected && !selected.connected ? (
        <ErrorBanner message={`Connect ${selected.name} in Settings before creating a playlist there.`} />
      ) : null}
      {create.isError ? <ErrorBanner message={toUserMessage(create.error)} /> : null}

      <Button
        mode="contained"
        disabled={!name.trim() || create.isPending || selected?.connected === false}
        onPress={async () => {
          const playlist = await create.mutateAsync({
            name: name.trim(),
            description: description.trim() || undefined,
            language: language.trim() || undefined,
            genre: genre.trim() || undefined,
            mood: mood.trim() || undefined,
            yearFrom: yearFrom ? Number(yearFrom) : undefined,
            yearTo: yearTo ? Number(yearTo) : undefined,
            targetDurationMs: duration ? Number(duration) * 60_000 : undefined,
            targetProvider: provider,
          });
          router.push(`/playlist/${playlist.playlist.id}`);
        }}
      >
        Create Playlist
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.card,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  flex: {
    flex: 1,
  },
  section: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
});
