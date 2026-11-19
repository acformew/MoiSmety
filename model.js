// Денежные суммы считаются в копейках; объёмы — до тысячных долей.
export const VERSION = 1;
export const MAX_PRICE = 10000000;
export const MAX_QTY = 1000000;
export const uid = () => crypto.randomUUID();
export const clone = x => JSON.parse(JSON.stringify(x));
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const money = x => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(x/100);
export const amount = (price,qty) => Math.round(Math.round(price*100)*Math.round(qty*1000)/1000);
export function totals(e) {
  const total=e.items.reduce((s,i)=>s+amount(i.price,i.qty),0);
  const done=e.items.reduce((s,i)=>s+amount(i.price,i.done),0);
  return {total,done,left:total-done,percent:total ? Math.min(100,Math.round(done/total*100)) : 0};
}
export function status(e) {
  if(e.archived) return 'В архиве';
  if(e.items.length && e.items.every(i=>i.done===i.qty) && e.items.some(i=>i.qty>0)) return 'Выполнена';
  if(e.items.some(i=>i.done>0)) return 'В работе';
  return 'Новая';
}
export function initialData(demo=true) {
  const categories=['Демонтажные работы','Подготовка поверхностей','Штукатурные работы','Шпаклёвка','Малярные работы','Плиточные работы','Напольные покрытия','Электромонтажные работы','Сантехнические работы','Гипсокартонные конструкции','Прочие работы'];
  const works=demo ? [['Снятие старых обоев',0,'м²',100],['Грунтовка стен',1,'м²',80],['Штукатурка стен',2,'м²',650],['Шпаклёвка стен',3,'м²',350],['Покраска стен в два слоя',4,'м²',300],['Укладка плитки',5,'м²',1500],['Укладка ламината',6,'м²',450],['Установка розетки',7,'шт.',350]].map(([name,c,unit,price])=>({id:uid(),name,category:categories[c],unit,price})) : [];
  return {schemaVersion:VERSION,categories,units:['м²','м³','шт.','пог. м','компл.','час'],works,estimates:[]};
}
export function newEstimate(works=[]) {
  const now=new Date().toISOString();
  return {id:uid(),name:'Новая смета',customer:'',address:'',date:today(),comment:'',createdAt:now,updatedAt:now,archived:false,items:works.map(w=>({id:uid(),name:w.name,unit:w.unit,price:w.price,qty:1,done:0}))};
}
export function numberValue(raw,kind='qty') {
  const s=String(raw).trim().replace(',','.');
  if(!/^\d+(\.\d+)?$/.test(s)) throw Error('Введите неотрицательное число.');
  const n=Number(s),precision=kind==='price'?2:3,max=kind==='price'?MAX_PRICE:MAX_QTY;
  if(!Number.isFinite(n)||n>max||Math.abs(n*10**precision-Math.round(n*10**precision))>0.00001) throw Error(`Допустимо до ${max.toLocaleString('ru-RU')} и ${precision} знаков после запятой.`);
  return n;
}
export function validate(data) {
  const fail=()=>{throw Error('Некорректный файл: структура, идентификаторы, числа или версия не поддерживаются.');};
  const text=(x,max=500)=>typeof x==='string'&&x.length<=max;
  const num=(x,kind)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=(kind==='price'?MAX_PRICE:MAX_QTY)&&Math.abs(x*10**(kind==='price'?2:3)-Math.round(x*10**(kind==='price'?2:3)))<0.00001;
  const id=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(x);
  const list=(a,max)=>Array.isArray(a)&&a.length<=max;
  const unique=a=>new Set(a.map(x=>x.id)).size===a.length;
  const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  const stamp=x=>typeof x==='string'&&x.length<50&&!isNaN(Date.parse(x));
  if(!data||data.schemaVersion!==VERSION||!list(data.categories,200)||!list(data.units,100)||!list(data.works,10000)||!list(data.estimates,1000)) fail();
  for(const a of [data.categories,data.units]) if(!a.length||a.some(x=>!text(x,100)||!x.trim())||new Set(a).size!==a.length) fail();
  if(!unique(data.works)||!unique(data.estimates))fail();
  for(const w of data.works) if(!w||!id(w.id)||!text(w.name)||!w.name.trim()||!data.categories.includes(w.category)||!data.units.includes(w.unit)||!num(w.price,'price'))fail();
  let grand=0;
  for(const e of data.estimates){
    if(!e||!id(e.id)||!text(e.name)||!e.name.trim()||!text(e.customer)||!text(e.address)||!text(e.comment,5000)||!date(e.date)||!stamp(e.createdAt)||!stamp(e.updatedAt)||typeof e.archived!=='boolean'||!list(e.items,1000)||!unique(e.items))fail();
    for(const i of e.items)if(!i||!id(i.id)||!text(i.name)||!i.name.trim()||!text(i.unit,100)||!i.unit.trim()||!num(i.price,'price')||!num(i.qty,'qty')||!num(i.done,'qty')||i.done>i.qty)fail();
    grand+=totals(e).total;
  }
  if(!Number.isSafeInteger(grand)||grand>900000000000000)fail();
  return clone(data);
}
export function parseBackup(text) {
  if(text.length>20*1024*1024)throw Error('Файл больше 20 МБ.');
  let raw;try{raw=JSON.parse(text);}catch{throw Error('Файл не является корректным JSON.');}
  return validate(raw.app==='moi-smety'?raw.data:raw);
}
export function backup(data) { return JSON.stringify({app:'moi-smety',exportedAt:new Date().toISOString(),data},null,2); }
// Повторный перенос тех же ID не создаёт дубликаты. Различающиеся записи требуют выбора пользователя.
export function mergeData(remote,local) {
  const result=clone(remote);
  result.categories=[...new Set([...remote.categories,...local.categories])];
  result.units=[...new Set([...remote.units,...local.units])];
  let conflicts=0;
  for(const key of ['works','estimates']) for(const item of local[key]) {
    const old=result[key].find(x=>x.id===item.id);
    if(!old) result[key].push(clone(item));
    else if(JSON.stringify(old)!==JSON.stringify(item))conflicts++;
  }
  return {data:validate(result),conflicts};
}
