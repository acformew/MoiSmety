import {CONFIG} from './config.js';
import {validate} from './model.js';
let clientPromise;
export const configured=()=>Boolean(CONFIG.supabaseUrl&&CONFIG.supabaseKey);
export async function getClient(){
  if(!configured())throw Error('Заполните config.js по инструкции README.md.');
  if(!/^https:\/\/[a-z0-9.-]+\/?$/i.test(CONFIG.supabaseUrl)||CONFIG.supabaseKey.startsWith('sb_secret_'))throw Error('Проверьте HTTPS URL и публичный ключ в config.js. Секретные ключи запрещены.');
  if(CONFIG.supabaseKey.startsWith('eyJ')){try{if(JSON.parse(atob(CONFIG.supabaseKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')throw Error();}catch{throw Error('Допустим только publishable или anon key.');}}
  if(!clientPromise)clientPromise=import(CONFIG.supabaseSdk).then(({createClient})=>createClient(CONFIG.supabaseUrl,CONFIG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})).catch(()=>{clientPromise=null;throw Error('SDK Supabase не загрузился. Проверьте интернет и доступ к CDN.');});
  return clientPromise;
}
export function cloudError(error){
  if(error?.code==='P0001'&&String(error.message).includes('REVISION_CONFLICT'))return Object.assign(Error('Облачная версия изменилась на другом устройстве. Ваши изменения сохранены в браузере. Выберите действие в настройках.'),{conflict:true});
  const code=error?.code||'';
  if(code==='42501')return Error('Доступ запрещён. Проверьте вход и политики RLS из schema.sql.');
  if(code==='PGRST202'||code==='42P01')return Error('Таблица или функция не найдена. Выполните весь schema.sql в SQL Editor.');
  return Error('Нет связи с облаком или запрос отклонён. Проверьте интернет, ключи, SQL и вход. Локальная копия сохранена.');
}
export class CloudStore {
  constructor(userId){this.userId=userId;}
  async user(){const c=await getClient();const {data,error}=await c.auth.getUser();if(error||data.user?.id!==this.userId)throw Error('Сессия завершилась или аккаунт сменился. Войдите снова.');return c;}
  async load(){const c=await this.user();const {data,error}=await c.from('estimate_spaces').select('payload,revision').eq('user_id',this.userId).maybeSingle();if(error)throw cloudError(error);return data?{data:validate(data.payload),revision:data.revision}:null;}
  async save(data,revision){validate(data);const c=await this.user();const {data:next,error}=await c.rpc('save_estimate_space',{p_payload:data,p_expected_revision:revision});if(error)throw cloudError(error);return Number(next);}
}
export async function signIn(email,password){const c=await getClient();const {error}=await c.auth.signInWithPassword({email,password});if(error)throw Error('Не удалось войти. Проверьте email, пароль и подтверждение почты.');}
export async function signUp(email,password){const c=await getClient();const {error}=await c.auth.signUp({email,password,options:{emailRedirectTo:location.href.split('#')[0].split('?')[0]}});if(error)throw Error('Регистрация не выполнена. Проверьте email, требования к паролю и лимит отправки писем в Supabase.');}
export async function signOut(){const c=await getClient();const {error}=await c.auth.signOut();if(error)throw Error('Не удалось выйти. Проверьте подключение.');}
