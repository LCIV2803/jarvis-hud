import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { brisbaneMonthRange, inBrisbaneMonth, brisbaneTodayISO, brisbaneDayKey, isFreshJarvisProgress, syncIsStale, formatActivityLog } from '@/lib/jarvis';
import HeaderBar from '@/components/jarvis/HeaderBar';
import Reactor from '@/components/jarvis/Reactor';
import StatColumn from '@/components/jarvis/StatColumn';
import CommsChannel from '@/components/jarvis/CommsChannel';
import ActivityCharts from '@/components/jarvis/ActivityCharts';
import TaskLanes from '@/components/jarvis/TaskLanes';
import LeadsView from '@/components/jarvis/LeadsView';
import MemoryView from '@/components/jarvis/MemoryView';
import GrainOverlay from '@/components/jarvis/GrainOverlay';
import ClapListener from '@/components/jarvis/ClapListener';
import JarvisVoice from '@/components/jarvis/JarvisVoice';

const PAGE_BG =
  'radial-gradient(ellipse 80% 60% at 50% 5%, rgba(17,78,114,0.24) 0%, transparent 70%), radial-gradient(ellipse 90% 70% at 50% 95%, rgba(15,46,82,0.2) 0%, transparent 70%), #040e1d';

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

const sig = (arr) => arr.map((x) => `${x.id}:${x.updated_date || x.created_date || ''}`).join('|');

export default function Today() {
  const { isAuthenticated, user } = useAuth();
  const canEdit = isAuthenticated && user?.role === 'admin';

  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [memories, setMemories] = useState([]);
  const [profile, setProfile] = useState(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [saving, setSaving] = useState({});
  const [errors, setErrors] = useState({});
  const [lastTaskSyncAt, setLastTaskSyncAt] = useState(null);
  const [taskSyncFailed, setTaskSyncFailed] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const renderNow = Date.now();

  const tasksRef = useRef([]);
  const logsRef = useRef([]);
  const leadsRef = useRef([]);
  const memRef = useRef([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);
  useEffect(() => { memRef.current = memories; }, [memories]);

  const loadTasks = useCallback(async () => {
    try {
      const list = await base44.entities.Task.list('-updated_date', 500);
      setTasks(list);
      setLastTaskSyncAt(Date.now());
      setTaskSyncFailed(false);
      return list;
    } catch (error) {
      setTaskSyncFailed(true);
      throw error;
    }
  }, []);

  const loadLogs = useCallback(async () => {
    const list = await base44.entities.ActivityLog.list('-created_date', 500);
    setLogs(list);
  }, []);

  const loadLeads = useCallback(async () => {
    const list = await base44.entities.Lead.list('-created_date', 500);
    setLeads(list);
  }, []);

  const loadMemories = useCallback(async () => {
    const list = await base44.entities.Memory.list('-created_date', 15);
    setMemories(list);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const list = await base44.entities.Profile.list('-updated_date', 1);
      setProfile(list[0] || null);
    } catch (e) { /* best effort */ }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadTasks().catch(() => {});
    loadLogs();
    loadLeads();
    loadMemories();
    loadProfile();
    const unsubT = base44.entities.Task.subscribe(() => { loadTasks().catch(() => {}); setPulseKey((k) => k + 1); });
    const unsubL = base44.entities.ActivityLog.subscribe(() => { loadLogs(); setPulseKey((k) => k + 1); });
    const unsubLeads = base44.entities.Lead.subscribe(() => loadLeads());
    const unsubMem = base44.entities.Memory.subscribe(() => loadMemories());
    return () => {
      unsubT();
      unsubL();
      unsubLeads();
      unsubMem();
    };
  }, [loadTasks, loadLogs, loadLeads, loadMemories, loadProfile]);

  // Reliable fallback poll for public viewers (socket rejected) — every 15s while visible.
  useEffect(() => {
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const [t, l, le, m] = await Promise.all([
          base44.entities.Task.list('-updated_date', 500),
          base44.entities.ActivityLog.list('-created_date', 500),
          base44.entities.Lead.list('-created_date', 500),
          base44.entities.Memory.list('-created_date', 15),
        ]);
        let changed = false;
        setLastTaskSyncAt(Date.now());
        setTaskSyncFailed(false);
        if (sig(tasksRef.current) !== sig(t)) { setTasks(t); changed = true; }
        if (sig(logsRef.current) !== sig(l)) { setLogs(l); changed = true; }
        if (sig(leadsRef.current) !== sig(le)) { setLeads(le); changed = true; }
        if (sig(memRef.current) !== sig(m)) { setMemories(m); changed = true; }
        if (changed) setPulseKey((k) => k + 1);
      } catch (e) { setTaskSyncFailed(true); }
    };
    const timer = setInterval(poll, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const completeTask = async (task) => {
    const target = task.status === 'done' ? 'todo' : 'done';
    const original = task;
    setSaving((s) => ({ ...s, [task.id]: true }));
    // optimistic move to the target column immediately
    setTasks((prev) => prev.map((t) => t.id === task.id
      ? { ...t, status: target, updated_date: new Date().toISOString() }
      : t));
    try {
      await base44.functions.invoke('upsertTask', { title: task.title, status: target, execution_owner: 'owner' });
      // after 200: refetch Tasks + ActivityLog and re-render
      await Promise.all([loadTasks(), loadLogs()]);
      setPulseKey((k) => k + 1);
    } catch (e) {
      // rollback to original column + show red note, auto-dismiss after 4s
      setTasks((prev) => prev.map((t) => (t.id === original.id ? original : t)));
      setErrors((s) => ({ ...s, [task.id]: true }));
      setTimeout(() => setErrors((s) => {
        const n = { ...s }; delete n[task.id]; return n;
      }), 4000);
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[task.id]; return n; });
    }
  };

  const advanceTask = async (task) => {
    const next = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'done';
    try {
      await base44.functions.invoke('upsertTask', { title: task.title, status: next, execution_owner: 'owner' });
      await Promise.all([loadTasks(), loadLogs()]);
      setPulseKey((k) => k + 1);
    } catch (e) {
      // stay in sync if the server rejected the advance
      await loadTasks();
    }
  };

  const addTask = async (title) => {
    try {
      await base44.functions.invoke('upsertTask', { title, status: 'todo' });
      await loadTasks();
    } catch (e) { /* best effort */ }
  };

  const monthRange = useMemo(() => brisbaneMonthRange(clockTick), [clockTick]);
  const todayKey = useMemo(() => brisbaneTodayISO(clockTick), [clockTick]);

  const revenue = useMemo(
    () => leads
      .filter((l) => l.status === 'won' && inBrisbaneMonth(l.won_at, monthRange))
      .reduce((s, l) => s + (typeof l.deal_value === 'number' ? l.deal_value : 0), 0),
    [leads, monthRange]
  );
  const spokenTo = useMemo(
    () => leads.filter((l) =>
      ['contacted', 'replied', 'won', 'lost'].includes(l.status) &&
      inBrisbaneMonth(l.updated_date, monthRange)
    ).length,
    [leads, monthRange]
  );
  const leadsGenerated = useMemo(
    () => leads.filter((l) => inBrisbaneMonth(l.created_date, monthRange)).length,
    [leads, monthRange]
  );
  const tasksDone = useMemo(
    () => tasks.filter((t) => t.status === 'done' && t.done_at && inBrisbaneMonth(t.done_at, monthRange)).length,
    [tasks, monthRange]
  );

  const doneToday = useMemo(
    () => tasks.filter((t) => t.status === 'done' && brisbaneDayKey(t.done_at) === todayKey).length,
    [tasks, todayKey]
  );
  const touchedToday = useMemo(
    () => tasks.filter((t) => brisbaneDayKey(t.updated_date) === todayKey).length,
    [tasks, todayKey]
  );

  const doingTasks = tasks.filter((t) => t.status === 'doing');
  const activeJarvisTasks = tasks.filter((t) => isFreshJarvisProgress(t, renderNow));
  const activeStatus = taskSyncFailed
    ? 'reconnecting'
    : syncIsStale(lastTaskSyncAt, renderNow)
      ? 'stale'
      : 'ok';
  // The header notice uses the same visible-feed filter as the comms channel.
  const visibleLogs = useMemo(() => (logs || []).filter((l) => !formatActivityLog(l).hidden), [logs]);
  const needsOwner = visibleLogs.length &&
    typeof visibleLogs[0].message === 'string' &&
    visibleLogs[0].message.startsWith('NEEDS OWNER')
    ? visibleLogs[0].message
    : null;
  const todoTasks = tasks
    .filter((t) => t.status === 'todo')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const doneTasks = tasks.filter((t) => t.status === 'done' && brisbaneDayKey(t.done_at) === todayKey);

  return (
    <div className="min-h-screen w-full" style={{ background: PAGE_BG }}>
      <GrainOverlay />
      <ClapListener />
      <JarvisVoice />
      <div className="jarvis-page-shell relative z-10">
        <HeaderBar goal={profile?.goal_90_day} voiceProvider={profile?.voice_provider || 'base44'} needsOwner={needsOwner} />
        <div className="py-8 flex flex-col gap-10">
          <div className="jarvis-command-grid">
            <StatColumn
              revenue={revenue}
              spokenTo={spokenTo}
              leadsGenerated={leadsGenerated}
              tasksDone={tasksDone}
            />
            <div className="jarvis-reactor-panel flex justify-center">
              <Reactor doneToday={doneToday} touchedToday={touchedToday} pulseKey={pulseKey} />
            </div>
            <div className="jarvis-comms-panel flex flex-col gap-6">
              <CommsChannel logs={logs} />
              <ActivityCharts logs={logs} tasks={tasks} />
            </div>
          </div>
          <TaskLanes
            doingTasks={doingTasks}
            todoTasks={todoTasks}
            doneTasks={doneTasks}
            onAdvance={advanceTask}
            onComplete={completeTask}
            onAdd={addTask}
            saving={saving}
            errors={errors}
            canEdit={canEdit}
            activeJarvisTasks={activeStatus === 'ok' ? activeJarvisTasks : []}
            activeStatus={activeStatus}
            lastSyncAt={lastTaskSyncAt}
          />
          <LeadsView leads={leads} />
          <MemoryView memories={memories} />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  component: Today,
  head: () => ({ meta: [{ title: "Jarvis HUD — Today" }] }),
});