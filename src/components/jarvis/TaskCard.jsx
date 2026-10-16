import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { HUD, isOverdue, isFreshJarvisProgress, relTime } from '@/lib/jarvis';

const laneBorder = { doing: HUD.accent, todo: HUD.border, done: HUD.green };

export default function TaskCard({ task, lane, onAdvance, onComplete, saving, error, canEdit }) {
  const border = laneBorder[lane];
  const overdue = isOverdue(task.due_date);
  const busy = !!saving;
  const tickDisabled = busy || !canEdit;
  const freshProgress = isFreshJarvisProgress(task);

  return (
    <div
      className="px-5 py-4"
      style={{ borderLeft: `1px solid ${border}`, background: 'rgba(7,26,58,0.4)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body text-[18px] text-hud-text break-words">{task.title || 'Untitled task'}</span>
            {task.priority === 'high' && (
              <span
                className="font-mono text-[11px] uppercase tracking-[0.1em] text-hud-amber px-2.5 py-1"
                style={{ border: '1px solid rgba(232,180,90,0.5)' }}
              >
                HIGH
              </span>
            )}
          </div>
          <div className="font-mono text-[14px] text-hud-faint mt-1">{task.priority}</div>
          {task.due_date && (
            <div className={`font-mono text-[14px] mt-0.5 ${overdue ? 'text-hud-red' : 'text-hud-faint'}`}>
              {task.due_date}
            </div>
          )}
          {(typeof task.notes === 'string' && task.notes.trim()) || (typeof task.result === 'string' && task.result.trim()) ? (
            <details className="mt-2">
              <summary className="font-mono text-[10px] uppercase tracking-[0.1em] text-hud-faint cursor-pointer">View result/details</summary>
              <div className="max-h-40 overflow-y-auto mt-1 font-body text-[14px] text-hud-text2/80 whitespace-pre-wrap break-words">
                {task.notes && <div>{task.notes}</div>}
                {task.result && <div className="text-hud-green/90 mt-2">{task.result}</div>}
              </div>
            </details>
          ) : null}
          {task.status === 'doing' && (
            <div className={`font-mono text-[10px] uppercase tracking-[0.1em] mt-2 ${freshProgress ? 'text-hud-accent' : 'text-hud-faint'}`} title="Based on latest saved agent progress; not a live worker heartbeat.">
              {task.execution_owner === 'jarvis'
                ? freshProgress ? 'Jarvis · In progress' : 'Jarvis · Awaiting progress update'
                : task.execution_owner === 'owner' ? 'Your task · In progress' : 'Board status · In progress'}
              {task.execution_owner === 'jarvis' && <span className="block mt-1">Updated {relTime(task.progress_updated_at)}</span>}
            </div>
          )}
          {typeof task.progress_note === 'string' && task.progress_note && (
            <p className="font-body text-[13px] text-hud-text2 mt-2 break-words">{task.progress_note}</p>
          )}
          {error && (
            <div className="font-mono text-[11px] tracking-[0.08em] text-hud-red mt-2">
              could not save
            </div>
          )}
        </div>
        <div className="shrink-0 mt-0.5 flex items-center gap-2">
          {task.status === 'todo' && (
            <button
              type="button"
              onClick={() => !tickDisabled && onAdvance(task)}
              disabled={tickDisabled}
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-hud-accent disabled:text-hud-faint"
              title={!canEdit ? 'sign in to edit' : 'Start as owner'}
            >Start</button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!tickDisabled) onComplete(task);
            }}
            disabled={tickDisabled}
            className={`${tickDisabled ? 'text-hud-faint' : 'text-hud-faint hover:text-hud-accent'}`}
            aria-label={task.status === 'done' ? 'Reopen task' : 'Mark done'}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
