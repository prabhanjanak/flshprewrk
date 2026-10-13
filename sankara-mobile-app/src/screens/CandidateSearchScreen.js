import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator,
  SafeAreaView
} from 'react-native';
import { api } from '../api/client';
import { Theme } from '../theme';
import { Search, User, ChevronRight, Filter } from 'lucide-react-native';

export default function CandidateSearchScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const res = await api.get('/candidates');
      setCandidates(res.data);
      setFiltered(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (search.trim() === '') {
      setFiltered(candidates);
    } else {
      const s = search.toLowerCase();
      const filteredData = candidates.filter(c => 
        c.fullName.toLowerCase().includes(s) || 
        c.candidateCode.toLowerCase().includes(s)
      );
      setFiltered(filteredData);
    }
  }, [search, candidates]);

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('CandidateDetail', { candidate: item })}
    >
      <View style={styles.avatar}>
        <User size={24} color={Theme.colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.code}>{item.candidateCode}</Text>
        <Text style={styles.name}>{item.fullName}</Text>
        <View style={styles.badgeRow}>
           <StatusBadge status={item.status} />
           <Text style={styles.unitText}>{item.unitName || 'No Unit'}</Text>
        </View>
      </View>
      <ChevronRight size={20} color={Theme.colors.border} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Search size={20} color={Theme.colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Search name or code..."
            value={search}
            onChangeText={setSearch}
          />
          {loading && <ActivityIndicator size="small" color={Theme.colors.primary} />}
        </View>
        <TouchableOpacity style={styles.filterBtn}>
           <Filter size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No candidates found</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function StatusBadge({ status }) {
  const getColors = () => {
    switch (status) {
      case 'allocated': return { bg: '#dcfce7', text: '#166534' };
      case 'pending': return { bg: '#fef9c3', text: '#854d0e' };
      case 'rejected': return { bg: '#fee2e2', text: '#991b1b' };
      default: return { bg: '#f1f5f9', text: '#475569' };
    }
  };
  const colors = getColors();
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    padding: Theme.spacing.md,
    gap: Theme.spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.radius.md,
    paddingHorizontal: Theme.spacing.md,
    height: 48,
  },
  input: {
    flex: 1,
    marginLeft: Theme.spacing.sm,
    ...Theme.typography.body,
    fontSize: 14,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: Theme.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.md,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: Theme.spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Theme.spacing.md,
  },
  info: {
    flex: 1,
  },
  code: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  name: {
    ...Theme.typography.body,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  unitText: {
    fontSize: 10,
    color: Theme.colors.textMuted,
    fontWeight: '600',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Theme.colors.textMuted,
    ...Theme.typography.body,
  }
});
