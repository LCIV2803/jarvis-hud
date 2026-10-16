import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const AGENT_NAME = 'jarvis';
const SETTLE_MS = 1600; // streaming pause that marks the reply as complete

// One conversation with the Jarvis agent; the latest finished reply triggers onReply.
export default function useJarvisConversation(onReply) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const conversationRef = useRef(null);
  const settleTimer = useRef(null);
  const spokenRef = useRef('');
  const replyRef = useRef(onReply);
  replyRef.current = onReply;

  const begin = useCallback(async () => {
    if (conversationRef.current) return conversationRef.current;
    conversationRef.current = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: 'Voice session', description: 'Hands-free Jarvis voice session' },
    });
    setConversationId(conversationRef.current.id);
    return conversationRef.current;
  }, []);

  useEffect(() => {
    if (!conversationId) return undefined;
    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      const next = data.messages || [];
      setMessages(next);
      const last = next[next.length - 1];
      const busy = !last || last.role !== 'assistant'
        || (last.tool_calls || []).some((call) => ['pending', 'running', 'in_progress'].includes(call.status));
      clearTimeout(settleTimer.current);
      const text = last && last.role === 'assistant' ? (last.content || '') : '';
      if (text && !busy) {
        const key = `${last.id || next.length}:${text}`;
        settleTimer.current = setTimeout(() => {
          if (key !== spokenRef.current) {
            spokenRef.current = key;
            replyRef.current(text);
          }
        }, SETTLE_MS);
      }
    });
    return unsubscribe;
  }, [conversationId]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const send = useCallback(async (text) => {
    const conversation = await begin();
    await base44.agents.addMessage(conversation, { role: 'user', content: String(text).slice(0, 500) });
  }, [begin]);

  return { messages, send, begin };
}