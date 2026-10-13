import React from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView 
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Theme } from '../theme';
import { 
  Users, 
  Monitor, 
  Search, 
  LogOut, 
  Calendar, 
  Briefcase,
  Bell,
  ChevronRight
} from 'lucide-react-native';

export default function DashboardScreen({ navigation }) {
  const { user, signOut } = useAuth();

  const modules = [
    { id: 'CandidateSearch', title: 'Candidates', icon: Users, color: '#3b82f6', description: 'Search & Status' },
    { id: 'tv', title: 'Waiting Hall', icon: Monitor, color: '#10b981', description: 'Live TV Monitor' },
    { id: 'panels', title: 'Interviews', icon: Briefcase, color: '#f59e0b', description: 'Panel Tracking' },
    { id: 'schedule', title: 'Schedule', icon: Calendar, color: '#6366f1', description: 'Daily View' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* WELCOME HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.userName}>{user.name}</Text>
            <Badge role={user.role} />
          </View>
          <TouchableOpacity style={styles.notificationBtn}>
             <Bell size={24} color={Theme.colors.text} />
             <View style={styles.dot} />
          </TouchableOpacity>
        </View>

        {/* QUICK STATS */}
        <View style={styles.statsRow}>
          <StatCard label="Waiting" value="12" color={Theme.colors.primary} />
          <StatCard label="In Progress" value="4" color={Theme.colors.success} />
          <StatCard label="Completed" value="45" color={Theme.colors.textMuted} />
        </View>

        {/* MODULE GRID */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operational Modules</Text>
          <View style={styles.grid}>
            {modules.map((m) => (
              <TouchableOpacity 
                key={m.id} 
                style={styles.moduleCard}
                onPress={() => m.id !== 'tv' && navigation.navigate(m.id)}
              >
                <View style={[styles.iconContainer, { backgroundColor: m.color + '10' }]}>
                  <m.icon size={28} color={m.color} />
                </View>
                <Text style={styles.moduleTitle}>{m.title}</Text>
                <Text style={styles.moduleDesc}>{m.description}</Text>
              </TouchableOpacity>
            ))}
          </div>
        </View>

        {/* ACTIONS */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
            <LogOut size={20} color={Theme.colors.error} />
            <Text style={styles.logoutText}>Sign Out from Device</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ role }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{role.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollContent: {
    padding: Theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.xl,
  },
  greeting: {
    ...Theme.typography.body,
    color: Theme.colors.textMuted,
  },
  userName: {
    ...Theme.typography.h2,
    color: Theme.colors.text,
    marginBottom: 4,
  },
  badge: {
    backgroundColor: Theme.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: Theme.colors.primary,
  },
  notificationBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.colors.error,
    borderWidth: 2,
    borderColor: Theme.colors.background,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  section: {
    marginBottom: Theme.spacing.xl,
  },
  sectionTitle: {
    ...Theme.typography.h3,
    marginBottom: Theme.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.md,
  },
  moduleCard: {
    width: '47.5%',
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.xl,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  moduleTitle: {
    ...Theme.typography.body,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  moduleDesc: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.spacing.md,
    gap: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fffafb',
    borderRadius: Theme.radius.md,
  },
  logoutText: {
    ...Theme.typography.body,
    color: Theme.colors.error,
    fontWeight: '700',
  }
});
