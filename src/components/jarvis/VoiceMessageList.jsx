import React from 'react';
import ReactMarkdown from 'react-markdown';

const bubble = 'max-w-[85%] px-2.5 py-1.5 text-xs leading-relaxed border ';

export default function VoiceMessageList({ messages, phase }) {
  if (!messages.length) {
    return <p className="font-mono text-[10px] text-hud-faint">{phase === 'listening' ? 'Speak your command.' : 'No messages yet.'}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        return (
          <div key={message.id || index} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
            <div className={bubble + (isUser ? ' border-hud-accent/40 text-hud-text text-right' : ' border-hud-border text-hud-text2')}>
              {isUser ? message.content : <ReactMarkdown className="max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{message.content}</ReactMarkdown>}
              {(message.tool_calls || []).length > 0 && (
                <p className="mt-1 font-mono text-[9px] tracking-[0.12em] uppercase text-hud-faint">
                  {message.tool_calls.map((call) => call.name).join(' · ')}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}