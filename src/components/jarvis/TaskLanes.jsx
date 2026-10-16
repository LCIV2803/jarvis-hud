import React, { useState } from 'react';
import TaskCard from './TaskCard';
import { relTime } from '@/lib/jarvis';

const LANES = [
  { key: 'doing', label: 'Doing Now' },
  { key: 'todo', label: 'To Do' },
  { key: 'done', label: 'Done Today' }
];

export default function TaskLanes({ doingTasks, todoTasks, doneTasks, onAdvance, onComplete, onAdd, saving, errors, canEdit, activeJarvisTasks = [], activeStatus = 'ok', lastSyncAt }) {
  const [text, setText] = useState('');
  const data = { doing: doingTasks, todo: todoTasks, done: doneTasks };

  const submit = (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };

  return (
    <div>
      <div className="mb-5 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-hud-text2" style={{ border: '1px solid rgba(82,181,255,0.25)', background: 'rgba(7,26,58,0.35)' }}>
        {activeStatus === 'reconnecting'
          ? `RECONNECTING · ACTIVE COUNT HIDDEN · LAST SYNC ${lastSyncAt ? relTime(new Date(lastSyncAt).toISOString()) : 'unknown'}`
          : activeStatus === 'stale'
            ? `TASK SYNC STALE · ACTIVE COUNT HIDDEN · LAST SYNC ${lastSyncAt ? relTime(new Date(lastSyncAt).toISOString()) : 'unknown'}`
            : `JARVIS · ${activeJarvisTasks.length} task${activeJarvisTasks.length === 1 ? '' : 's'} in progress`}
        {activeStatus === 'ok' && <span className="ml-2 text-hud-faint normal-case" title="Based on latest saved agent progress; not a live worker heartbeat.">based on latest saved agent progress</span>}
        {activeStatus === 'ok' && activeJarvisTasks.slice(0, 3).map(task => (
          <div key={task.id} className="mt-2 font-body normal-case tracking-normal text-[14px] text-hud-accent break-words">
            {task.title}{task.progress_note ? ` — ${task.progress_note}` : ''}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {LANES.map((lane) => (
        <div key={lane.key} className="flex flex-col">
          <div className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2 pb-2">
            {lane.label}
          </div>
          <div className="h-px bg-hud-border mb-3" />
          {lane.key === 'todo' && (
            <form onSubmit={submit} className="mb-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={canEdit ? 'Add a task' : 'sign in to edit'}
                disabled={!canEdit}
                className="w-full bg-transparent border-0 border-b border-hud-border text-hud-text font-body py-1 outline-none placeholder:text-hud-faint disabled:opacity-60"
              />
            </form>
          )}
          <div className="flex flex-col gap-3">
            {data[lane.key].map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                lane={lane.key}
                onAdvance={onAdvance}
                onComplete={onComplete}
                saving={!!saving[t.id]}
                error={!!errors[t.id]}
                canEdit={canEdit}
              />
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
