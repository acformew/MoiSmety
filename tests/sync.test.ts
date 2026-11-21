import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({db:()=>({rpc})}));
import { syncAccount } from '../src/offline/sync';
import { editState, readState } from '../src/offline/storage';
import { diff, empty } from '../src/offline/model';
it('recovers a committed request whose response was lost using the same durable operation ID',async()=>{
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 const user='retry-account';
 await editState(user,s=>{s.data.work_items.push({id:'one',user_id:user,name:'Кладка',unit:'м²',price:40,created_at:'now',updated_at:'now'});return s;});
 let lost=true;
 const receipts=new Map();
 const remote={...empty(),account_id:user};
 rpc.mockImplementation(async(_name,args)=>{
   if(!receipts.has(args.operation_id)){
     remote.work_items.push(args.changes[0].after);
     receipts.set(args.operation_id,structuredClone(remote));
   }
   if(lost){lost=false;throw Error('Connection lost after commit');}
   return {data:receipts.get(args.operation_id),error:null};
 });
 await expect(syncAccount(user,()=>{})).rejects.toThrow('Connection lost');
 const inflight=(await readState(user)).inflight!;
 expect(inflight).toBeDefined();
 await syncAccount(user,()=>{});
 const state=await readState(user);
 expect(state.inflight).toBeUndefined();
 expect(diff(state.base,state.data)).toHaveLength(0);
 expect(remote.work_items).toHaveLength(1);
 expect(rpc.mock.calls[0][1].operation_id).toBe(rpc.mock.calls[1][1].operation_id);
});
it('rejects a response belonging to a different account',async()=>{
 rpc.mockResolvedValue({data:{...empty(),account_id:'other'},error:null});
 await expect(syncAccount('account',()=>{})).rejects.toThrow('другому аккаунту');
});
