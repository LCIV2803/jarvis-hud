import { createClientFromRequest } from 'npm:@base44/sdk';
import { secrets, waitUntil } from 'base44:runtime';
import { runAfterCallPoll } from '../../shared/after-call-bridge.ts';
export default async function(req) {
  if(req.method !== 'POST') return Response.json({error:'method_not_allowed'},{status:405});
  const b=createClientFromRequest(req);
  let user;
  try { user=await b.auth.me(); } catch { return Response.json({error:'unauthorized'},{status:401}); }
  if(user?.role!=='admin') return Response.json({error:'forbidden'},{status:403});
  const pat=secrets.get('JARVIS_NATIVE_TOKEN');
  if(!pat) return Response.json({error:'native_token_not_configured'},{status:503});
  // The Base44 Superagent id is read from the Profile at runtime; without it there
  // is no conversation to dispatch, so fail fast in plain words.
  const profile=(await b.asServiceRole.entities.Profile.list('-updated_date',1))[0]||null;
  const agentId=profile?.superagent_id||'';
  if(typeof agentId!=='string'||!agentId.trim()) return Response.json({error:'Add your Jarvis agent ID in Settings first.'},{status:400});
  const run=async()=>{
    try {
      const result=await runAfterCallPoll({store:{control:b.asServiceRole.entities.CallControl,receipt:b.asServiceRole.entities.CallReceipt,logs:b.asServiceRole.entities.ActivityLog,profile:b.asServiceRole.entities.Profile},pat});
      if(result.processed || !['ok','poll_lock_busy','not_configured'].includes(result.reason)) {
        await b.asServiceRole.entities.ActivityLog.create({type:'note',task_title:'Jarvis after-call bridge',message:'After-call bridge: '+JSON.stringify(result)});
      }
    } catch {
      await b.asServiceRole.entities.ActivityLog.create({type:'note',task_title:'Jarvis after-call bridge',message:'After-call bridge failed; check receipt status before retrying.'}).catch(()=>{});
    }
  };
  waitUntil(new Promise(resolve=>setTimeout(()=>resolve(run()),0)));
  return Response.json({ok:true,queued:true},{status:202,headers:{'Cache-Control':'no-store'}});
}
