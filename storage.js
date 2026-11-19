import {initialData,validate,clone} from './model.js';
export const LOCAL_KEY='moi-smety:local:v1';
export class LocalStore {
  constructor(key=LOCAL_KEY){ this.key=key; this.token=null; }
  load(seed=true){
    let raw;try{raw=localStorage.getItem(this.key);}catch{throw Error('Браузер запретил доступ к хранилищу. Разрешите данные сайта.');}
    if(!raw){this.token=null;return {data:initialData(seed),revision:0,pending:false};}
    try{
      const env=JSON.parse(raw);validate(env.data);
      if(!Number.isSafeInteger(env.revision)||env.revision<0||typeof env.pending!=='boolean'||typeof env.token!=='string')throw Error();
      this.token=env.token;return env;
    }catch{throw Error('Сохранённые данные повреждены. Они не перезаписаны. Скачайте исходную копию в настройках и восстановите JSON.');}
  }
  save(data,meta={}){
    validate(data);
    let old;
    try{old=localStorage.getItem(this.key);}catch{throw Error('Хранилище недоступно. Экспортируйте JSON.');}
    const current=old ? JSON.parse(old) : null;
    if((current?.token??null)!==this.token)throw Error('Данные изменились в другой вкладке. Экспортируйте текущие данные и обновите страницу.');
    const env={data:clone(data),revision:meta.revision??current?.revision??0,pending:meta.pending??current?.pending??false,token:crypto.randomUUID()};
    try{localStorage.setItem(this.key,JSON.stringify(env));}catch{throw Error('Не удалось сохранить: хранилище заполнено или запрещено. Последняя сохранённая версия не изменена. Скачайте JSON и освободите место.');}
    this.token=env.token;return env;
  }
}
// Только после явного подтверждения восстановления повреждённого хранилища.
LocalStore.prototype.replaceConfirmed=function(data){
  validate(data);const env={data:clone(data),revision:0,pending:false,token:crypto.randomUUID()};
  try{localStorage.setItem(this.key,JSON.stringify(env));}catch{throw Error('Восстановление не удалось: хранилище недоступно или заполнено.');}
  this.token=env.token;return env;
};
