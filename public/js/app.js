/* Santé ERP — aplicación (sin dependencias). El servidor está en src/worker.js */
const IMG={logo:"assets/logo.png",amber:"assets/botella-ambar.jpg",labAmber:"assets/etiqueta-ambar.jpg",labRed:"assets/etiqueta-roja.jpg"};
const START='2026-10';
const MEDIOS=['Efectivo','Transferencia','Nequi','Daviplata','Tarjeta'];
const COLS=['productos','clientes','compras','ventas','movcaja','ajustes','activos','cotizaciones','pedidos'];
let VENDEDORES=['Santiago','Laura'];
const COMPS=['Cerveza','Etiqueta','Caja six pack','Otro costo'];
const UBICS=['Galán','Cervecería Andrey','Madrid','Otro lugar'];
const CAT_ACT=['Cocción','Fermentación y maduración','Frío y refrigeración','Envasado y embotellado','Molienda y transporte de mosto','Laboratorio y control','Servicios (agua, vapor, gas, aire)','Utensilios y herramientas','Mobiliario y oficina','Otro'];
const EST_ACT=['Operativo','En mantenimiento','Fuera de servicio','Dado de baja'];
const CAT_EGR=['Inversión inicial','Nómina','Arriendo','Servicios','Marketing','Transporte','Impuestos','Otros egresos'];
const CAT_ING=['Aporte de socios','Otros ingresos'];

/*PURE*/
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Math.round(n||0));
const nf=n=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:1}).format(n||0);
const pad=n=>String(n||0).padStart(4,'0');
const tot=items=>(items||[]).reduce((a,i)=>a+(+i.cant||0)*(+i.val||0),0);
const pad2=n=>String(n).padStart(2,'0');
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())};
const cm=n=>{const a=Math.abs(n),s=n<0?'-':'';if(a>=1e6)return s+(a/1e6).toFixed(a>=1e7?0:1).replace('.0','')+' M';if(a>=1e3)return s+Math.round(a/1e3)+' mil';return s+Math.round(a)};
const mkey=f=>(f||'').slice(0,7);
const addMonths=(m,k)=>{let [y,mo]=m.split('-').map(Number);mo+=k;y+=Math.floor((mo-1)/12);mo=((mo-1)%12+12)%12+1;return y+'-'+pad2(mo)};
const addDays=(f,n)=>{const d=new Date(f+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(+n||0));return d.toISOString().slice(0,10)};
const dayDiff=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
function derive(S){
  const P=Object.fromEntries(S.productos.map(p=>[p.id,p]));
  const C=Object.fromEntries(S.clientes.map(c=>[c.id,c]));
  const cc={};
  S.compras.filter(o=>o.estado==='Recibida').forEach(o=>(o.items||[]).forEach(i=>{const m=cc[i.pid]||(cc[i.pid]={}),a=m[i.comp||'Cerveza']||(m[i.comp||'Cerveza']={q:0,v:0});a.q+=+i.cant||0;a.v+=(+i.cant||0)*(+i.val||0)}));
  const comps=pid=>{const m=cc[pid]||{},pp=Math.max(1,+(P[pid]&&P[pid].porPack)||6),av=c=>m[c]&&m[c].q?m[c].v/m[c].q:0;
    const r={'Cerveza':av('Cerveza'),'Etiqueta':av('Etiqueta'),'Caja six pack':av('Caja six pack')/pp,'Otro costo':av('Otro costo')};r.total=r['Cerveza']+r['Etiqueta']+r['Caja six pack']+r['Otro costo'];r.pp=pp;return r};
  const cp=pid=>{const t=comps(pid).total;return t>0?t:((P[pid]&&P[pid].costo)||0)};
  const inv=[];let k=0;
  S.compras.forEach(o=>{if(o.estado==='Recibida')(o.items||[]).filter(i=>(i.comp||'Cerveza')==='Cerveza').forEach(i=>inv.push({f:o.fechaRecibo||o.fecha,k:k++,pid:i.pid,t:'Entrada',q:+i.cant||0,ref:'OC-'+pad(o.n),rk:'compra',rid:o.id,det:o.proveedor||''}))});
  S.ventas.forEach(v=>{if(v.estado!=='Anulado')(v.items||[]).forEach(i=>inv.push({f:v.fecha,k:k++,pid:i.pid,t:'Salida',q:-(+i.cant||0),ref:'VT-'+pad(v.n),rk:'venta',rid:v.id,det:(C[v.clienteId]&&C[v.clienteId].nombre)||'Cliente ocasional'}))});
  S.ajustes.forEach(a=>inv.push({f:a.fecha,k:k++,pid:a.pid,t:'Ajuste',q:+a.cant||0,ref:'AJ',rk:'ajuste',rid:a.id,det:a.motivo||''}));
  inv.sort((a,b)=>a.f<b.f?-1:a.f>b.f?1:a.k-b.k);
  const stock={},ent={},sal={},aj={};
  inv.forEach(r=>{stock[r.pid]=(stock[r.pid]||0)+r.q;r.saldo=stock[r.pid];const m=r.t==='Entrada'?ent:r.t==='Salida'?sal:aj;m[r.pid]=(m[r.pid]||0)+r.q});
  const cash=[];k=0;
  S.ventas.forEach(v=>{
    const cn=(C[v.clienteId]&&C[v.clienteId].nombre)||'cliente ocasional';
    v.abonado=(v.abonos||[]).reduce((a,x)=>a+(+x.monto||0),0);
    v.saldo=v.estado==='Pendiente'?Math.max(0,(+v.total||0)-v.abonado):0;
    v.vence=v.condicion==='Crédito'?addDays(v.fecha,+v.plazo||0):v.fecha;
    if(v.estado==='Anulado')return;
    (v.abonos||[]).forEach(a=>cash.push({f:a.fecha,k:k++,t:'Ingreso',m:+a.monto||0,medio:a.medio,con:'Abono de '+cn,ref:'VT-'+pad(v.n),rk:'venta',rid:v.id,orig:'Venta',cat:'Ventas'}));
    if(v.estado==='Pagado'){const rem=(+v.total||0)-v.abonado;if(rem>0.5)cash.push({f:v.fechaPago||v.fecha,k:k++,t:'Ingreso',m:rem,medio:v.medio,con:(v.abonado?'Saldo de ':'Venta a ')+cn,ref:'VT-'+pad(v.n),rk:'venta',rid:v.id,orig:'Venta',cat:'Ventas'})}
  });
  S.compras.forEach(o=>{if(o.pago==='Pagado'&&o.estado!=='Anulada')cash.push({f:o.fechaPago||o.fecha,k:k++,t:'Egreso',m:+o.total||0,medio:o.medio,con:'Compra a '+(o.proveedor||'proveedor'),ref:'OC-'+pad(o.n),rk:'compra',rid:o.id,orig:'Compra',cat:'Compras'})});
  S.movcaja.forEach(x=>cash.push({f:x.fecha,k:k++,t:x.tipo,m:+x.monto||0,medio:x.medio,con:x.concepto||x.cat,ref:'',rk:'caja',rid:x.id,orig:'Manual',cat:x.cat}));
  cash.sort((a,b)=>a.f<b.f?-1:a.f>b.f?1:a.k-b.k);
  let run=0;cash.forEach(r=>{run+=r.t==='Ingreso'?r.m:-r.m;r.saldo=run});
  const vOk=S.ventas.filter(v=>v.estado!=='Anulado');
  const valorInv=Object.keys(stock).reduce((a,pid)=>a+Math.max(0,stock[pid])*cp(pid),0);
  return {P,C,cp,comps,inv,cash,stock,ent,sal,aj,vOk,saldo:run,valorInv,
    cobrar:S.ventas.filter(v=>v.estado==='Pendiente').reduce((a,v)=>a+(v.saldo||0),0),
    vencida:S.ventas.filter(v=>v.estado==='Pendiente'&&v.vence<todayStr()).reduce((a,v)=>a+(v.saldo||0),0),
    pagar:S.compras.filter(o=>o.pago==='Pendiente'&&o.estado!=='Anulada').reduce((a,o)=>a+(+o.total||0),0)};
}
function monthStats(D,m){
  const vm=D.vOk.filter(v=>mkey(v.fecha)===m);
  const ventas=vm.reduce((a,v)=>a+(+v.total||0),0);
  let cogs=0;vm.forEach(v=>(v.items||[]).forEach(i=>{cogs+=(+i.cant||0)*D.cp(i.pid)}));
  const cm_=D.cash.filter(r=>mkey(r.f)===m);
  return {ventas,n:vm.length,cogs,ing:cm_.filter(r=>r.t==='Ingreso').reduce((a,r)=>a+r.m,0),egr:cm_.filter(r=>r.t==='Egreso').reduce((a,r)=>a+r.m,0),vm};
}
function niceScale(min,max){
  if(max<=min)max=min+1;
  const rough=(max-min)/4,mag=Math.pow(10,Math.floor(Math.log10(rough)));
  const step=[1,2,2.5,5,10].map(s=>s*mag).find(s=>s>=rough);
  return {min:Math.floor(min/step)*step,max:Math.ceil(max/step)*step,step};
}
function chartData(D,months,curMonth){
  return months.map(m=>{
    const rows=D.cash.filter(r=>mkey(r.f)===m);
    const ing=rows.filter(r=>r.t==='Ingreso').reduce((a,r)=>a+r.m,0), egr=rows.filter(r=>r.t==='Egreso').reduce((a,r)=>a+r.m,0);
    const saldo=D.cash.filter(r=>mkey(r.f)<=m).reduce((a,r)=>a+(r.t==='Ingreso'?r.m:-r.m),0);
    return {m,ing,egr,saldo,future:m>curMonth};
  });
}
/*ENDPURE*/

const S={productos:[],clientes:[],compras:[],ventas:[],movcaja:[],ajustes:[],activos:[],cotizaciones:[],pedidos:[],ready:{},err:null};
const UI={view:'resumen',month:null,q:'',fest:'',fmed:'',fprod:'',ftipo:'',fmes:'',fcli:'',fcat:'',aloc:'',acat:'',aest:'',aq:'',vleg:false,bkarm:false,bkbusy:false,bkprog:'',fvend:'',cest:'',pvend:'',pest:''};
let DB=null,DL=null,D=derive(S);
const $=(s,r=document)=>r.querySelector(s);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const mname=m=>{const t=new Date(m+'-15T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'});return t.charAt(0).toUpperCase()+t.slice(1)};
const fdate=f=>f?new Date(f+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short'}):'—';
const pill=(t,k)=>`<span class="pill ${k}">${esc(t)}</span>`;
const nextN=arr=>arr.reduce((a,x)=>Math.max(a,+x.n||0),0)+1;
const pname=pid=>(D.P[pid]&&D.P[pid].nombre)||'Producto eliminado';
const itemsTxt=items=>(items||[]).map(i=>`${nf(i.cant)}× ${i.comp&&i.comp!=='Cerveza'?esc(i.comp)+' · ':''}${esc(pname(i.pid))}`).join(', ')||'—';
const curMonth=()=>{const m=todayStr().slice(0,7);return m<START?START:m};

const VIEWS=[['resumen','Dashboard'],['ventas','Ventas','Comercial'],['inventario','Inventario'],['clientes','CRM'],['productos','Productos'],['compras','Órdenes de compra','Administrativo'],['cartera','Cartera'],['cotizaciones','Cotizaciones'],['caja','Flujo de caja'],['inversion','Inversión inicial'],['activos','Activos de fábrica'],['respaldo','Copia de seguridad'],['usuarios','Usuarios'],['pedidos','Solicitud de pedidos','Equipo de ventas']];
const ICONS={resumen:'<path d="M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z"/>',ventas:'<path d="M3 2h10v12l-2-1.5L9 14l-2-1.5L5 14l-2-1.5zM5.5 5.5h5M5.5 8h5"/>',clientes:'<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4"/>',productos:'<path d="M7 1.5h2v3l1.5 2.5v7h-5v-7L7 4.5z"/>',compras:'<path d="M1.5 2.5h2l1.5 8h7l1.5-5.5H4.5"/><circle cx="6" cy="13" r=".8"/><circle cx="11" cy="13" r=".8"/>',inventario:'<path d="M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6"/>',caja:'<path d="M2 4h12v8H2zM2 7h12"/><circle cx="8" cy="9.5" r="1"/>',usuarios:'<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3.2a2.5 2.5 0 010 4.6M12.5 9.8c1.3.6 2 1.8 2 3.7"/>',respaldo:'<path d="M8 2v8M5 7l3 3 3-3M2.5 11v2.5h11V11"/>',activos:'<path d="M2 14h12M3.5 14V7l4.5-3 4.5 3v7M6.5 14v-4h3v4"/>',cotizaciones:'<path d="M3 2h7l3 3v9H3zM10 2v3h3M5.5 8h5M5.5 10.5h5"/>',pedidos:'<path d="M2 3h12v8H6l-3 3v-3H2zM5 6h6M5 8.5h4"/>',cartera:'<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',inversion:'<path d="M2 13.5V10M6 13.5V7M10 13.5V9M14 13.5V3"/>'};

/* ---------- escritura ---------- */
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{e.hidden=true},3600)}
async function dbSet(col,id,data){if(!DB){toast('Esta vista no puede guardar datos.');return false}try{await DB.collection(col).doc(id).set(data);return true}catch(e){toast('No se pudo guardar ('+(e.code||'error')+').');return false}}
async function dbUpd(col,id,data){if(!DB){toast('Esta vista no puede guardar datos.');return false}try{await DB.collection(col).doc(id).update(data);return true}catch(e){toast('No se pudo actualizar ('+(e.code||'error')+').');return false}}
async function dbDel(col,id){if(!DB)return false;try{await DB.collection(col).doc(id).delete();return true}catch(e){toast('No se pudo eliminar ('+(e.code||'error')+').');return false}}

/* ---------- módulos ---------- */
function setHead(t,s,tools=''){$('#ttl').textContent=t;$('#sub').textContent=s||'';$('#tools').innerHTML=tools}
const btn=(label,act,extra='',cls='')=>`<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;
const monthInput=(key,val,all,upto)=>`<label class="mut small">Período <select class="inp" id="ui_${key}" data-ui="${key}">${all?`<option value="" ${val===''?'selected':''}>Todos</option>`:''}${monthOptions(upto).map(m=>`<option value="${m}" ${m===val?'selected':''}>${mname(m)}</option>`).join('')}</select></label>`;
function monthOptions(upto){const out=[];let m=START;const last=upto?curMonth():addMonths(curMonth(),2);while(m<=last){out.push(m);m=addMonths(m,1)}return out}
const emptyHtml=(t,p,b='')=>`<div class="empty"><b>${t}</b>${p}${b?`<div style="margin-top:12px">${b}</div>`:''}</div>`;
const tableWrap=h=>`<div class="tw">${h}</div>`;

function barLineSvg(months,bars,line,aria){
  const W=640,H=262,L=54,R=10,T=12,B=30,pw=W-L-R,ph=H-T-B;
  const all=[1000000];bars.forEach(b=>all.push(...b.vals));if(line)all.push(...line.vals.filter(v=>v!=null));
  const sc=niceScale(0,Math.max(...all));
  const y=v=>T+ph-(v-sc.min)/(sc.max-sc.min)*ph,band=pw/months.length,n=bars.length,bw=Math.min(26,band*.7/n);
  let s=`<div class="legend">${bars.map(b=>`<span><i style="background:${b.color}"></i>${esc(b.name)}</span>`).join('')}${line?`<span><i style="background:${line.color}"></i>${esc(line.name)}</span>`:''}</div><div class="tw"><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px;display:block" role="img" aria-label="${esc(aria)}">`;
  for(let v=sc.min;v<=sc.max+1e-9;v+=sc.step){s+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end">${cm(v)}</text>`}
  s+=`<line class="ax" x1="${L}" x2="${W-R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  const pts=[];
  months.forEach((m,i)=>{const cx=L+band*i+band/2;
    bars.forEach((b,j)=>{const v=b.vals[i];if(v>0)s+=`<rect x="${(cx-n*bw/2+j*bw).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${(y(0)-y(v)).toFixed(1)}" rx="2" fill="${b.color}"><title>${esc(b.name)} · ${fmt(v)}</title></rect>`});
    const lab=new Date(m+'-15T12:00:00').toLocaleDateString('es-CO',{month:'short'}).replace('.','');
    s+=`<text x="${cx.toFixed(1)}" y="${H-10}" text-anchor="middle">${lab}${m.endsWith('-01')||i===0?' '+m.slice(2,4):''}</text>`;
    if(line&&line.vals[i]!=null)pts.push([cx,y(line.vals[i]),line.vals[i]])});
  if(pts.length){s+=`<polyline fill="none" stroke="${line.color}" stroke-width="2" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`;
    pts.forEach((p,i)=>{s+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===pts.length-1?4.5:3}" fill="var(--surface)" stroke="${line.color}" stroke-width="2"/>`});
    const lp=pts[pts.length-1];s+=`<text x="${Math.min(lp[0],W-R-4).toFixed(1)}" y="${(lp[1]-10).toFixed(1)}" text-anchor="end" style="fill:var(--fg);font-weight:600">${cm(lp[2])}</text>`}
  return s+'</svg></div>';
}
const vendKey=v=>VENDEDORES.includes(v.vendedor)?v.vendedor:'Sin asignar';
function vendTable(){
  const names=[...VENDEDORES];if(D.vOk.some(v=>vendKey(v)==='Sin asignar'))names.push('Sin asignar');
  const tv=D.vOk.reduce((a,v)=>a+v.total,0);
  return tableWrap(`<table><thead><tr><th>Vendedor</th><th class="r">Pedidos</th><th class="r">Ventas</th><th class="r">Part.</th><th class="r">Cartera</th></tr></thead><tbody>${names.map(nm=>{const vs=D.vOk.filter(v=>vendKey(v)===nm),t=vs.reduce((a,v)=>a+v.total,0);return `<tr><td><b>${esc(nm)}</b></td><td class="r">${vs.length}</td><td class="r">${fmt(t)}</td><td class="r">${tv?Math.round(t/tv*100)+'%':'—'}</td><td class="r">${fmt(vs.reduce((a,v)=>a+v.saldo,0))}</td></tr>`}).join('')}</tbody></table>`);
}
function vResumen(){
  const m=UI.month||curMonth();const st=monthStats(D,m),pm=monthStats(D,addMonths(m,-1));
  const acum=D.vOk.reduce((a,v)=>a+(+v.total||0),0);
  const hasData=S.ventas.length+S.compras.length+S.movcaja.length>0;
  setHead('Dashboard',mname(m)+' · operación iniciada en octubre de 2026',monthInput('month',m,false)+btn('Nueva solicitud de pedido','new','data-kind="pedido"','pri'));
  let h='';
  if(!hasData)h+=`<div class="banner"><p><b>Todavía no hay movimientos.</b> Registre el aporte inicial de los socios, las compras y las ventas para ver los indicadores. Si prefiere explorar primero, cargue datos de ejemplo; quedan marcados y se pueden quitar con un clic.</p><div class="tools">${btn('Registrar aporte inicial','new','data-kind="mov" data-preset="aporte"','pri')}${btn('Cargar datos de ejemplo','seed')}</div></div>`;
  if(hasData&&COLS.some(c=>S[c].some(x=>x.ejemplo)))h+=`<div class="banner"><p><b>Está viendo datos de ejemplo.</b> Reemplácelos por la operación real cuando esté lista.</p>${btn('Quitar datos de ejemplo','unseed')}</div>`;
  const delta=pm.ventas>0&&m>START?((st.ventas-pm.ventas)/pm.ventas*100):null;
  const pend=S.ventas.filter(v=>v.estado==='Pendiente'&&v.saldo>0).length;
  h+=`<div class="grid g4">
  <div class="card kpi md hero"><span class="lab">Ventas de ${mname(m).split(' ')[0].toLowerCase()}</span><span class="val num">${fmt(st.ventas)}</span><span class="note">${st.n} pedido${st.n===1?'':'s'}${delta!==null?` · <span class="${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${Math.abs(delta).toFixed(0)}%</span> vs. mes anterior`:''}</span></div>
  <div class="card kpi md"><span class="lab">Ventas acumuladas</span><span class="val num">${fmt(acum)}</span><span class="note">${D.vOk.length} pedido${D.vOk.length===1?'':'s'}${D.vOk.length?` · ticket promedio ${fmt(acum/D.vOk.length)}`:''}</span></div>
  <div class="card kpi md"><span class="lab">Cartera</span><span class="val num">${fmt(D.cobrar)}</span><span class="note">${pend} pedido${pend===1?'':'s'} con saldo${D.vencida?` · <span class="down">${fmt(D.vencida)} vencidos</span>`:''}</span></div>
  <div class="card kpi md"><span class="lab">Saldo de caja</span><span class="val num">${fmt(D.saldo)}</span><span class="note">${mname(m)}: ingresos ${fmt(st.ing)} · egresos ${fmt(st.egr)}</span></div></div>`;
  const months=[];let mm=START;const lastM=D.cash.length?D.cash[D.cash.length-1].f.slice(0,7):START;const endM=[addMonths(START,5),lastM,curMonth()].sort().pop();while(mm<=endM){months.push(mm);mm=addMonths(mm,1)}
  const cur=curMonth(),byM=months.map(x=>D.vOk.filter(v=>mkey(v.fecha)===x));
  const tots=byM.map(vs=>vs.reduce((a,v)=>a+v.total,0));let run=0;const cum=tots.map((v,i)=>{run+=v;return months[i]>cur?null:run});
  h+=`<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Comportamiento de las ventas</h2>${barLineSvg(months,[{name:'Ventas del mes',color:'var(--bar-in)',vals:tots}],{name:'Ventas acumuladas',color:'var(--line-saldo)',vals:cum},'Ventas por mes y ventas acumuladas')}</div>`;
  const names=[...VENDEDORES];if(D.vOk.some(v=>vendKey(v)==='Sin asignar'))names.push('Sin asignar');
  const pal=['var(--bar-in)','var(--bar-out)','var(--line-saldo)','var(--amber)'];
  h+=`<div class="card"><h2>Ventas por vendedor</h2>${barLineSvg(months,names.map((nm,i)=>({name:nm,color:nm==='Sin asignar'?'var(--muted)':pal[i%pal.length],vals:byM.map(vs=>vs.filter(v=>vendKey(v)===nm).reduce((a,v)=>a+v.total,0))})),null,'Ventas por mes de cada vendedor')}${vendTable()}</div></div>`;
  const ub=st.ventas-st.cogs,cliMes=new Set(st.vm.map(v=>v.clienteId||'_')).size;
  h+=`<div class="grid g4" style="margin-top:16px">
  <div class="card kpi sm"><span class="lab">Utilidad bruta del mes</span><span class="val num">${fmt(ub)}</span><span class="note">${st.ventas?((ub/st.ventas)*100).toFixed(0)+'% de margen':'Sin ventas en el mes'}</span></div>
  <div class="card kpi sm"><span class="lab">Valor del inventario</span><span class="val num">${fmt(D.valorInv)}</span><span class="note">Al costo promedio de compra</span></div>
  <div class="card kpi sm"><span class="lab">Por pagar</span><span class="val num">${fmt(D.pagar)}</span><span class="note">${(k=>k+(k===1?' orden sin pagar':' órdenes sin pagar'))(S.compras.filter(o=>o.pago==='Pendiente'&&o.estado!=='Anulada').length)}</span></div>
  <div class="card kpi sm"><span class="lab">Clientes con compra</span><span class="val num">${cliMes}</span><span class="note">En el mes seleccionado</span></div></div>`;
  h+=`<div class="grid g21" style="margin-top:16px"><div class="card"><h2>Flujo de caja por mes</h2>${chartSvg(chartData(D,months,curMonth()))}</div>
  <div class="card"><h2>Stock por producto</h2>${stockList()}</div></div>`;
  h+=`<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Caja por medio de pago · ${mname(m)}</h2>${medioTable(m)}</div>
  <div class="card"><h2>Últimos pedidos</h2>${lastVentas()}</div></div>`;
  return h;
}
function chartSvg(data){
  const W=640,H=262,L=54,R=10,T=12,B=30,pw=W-L-R,ph=H-T-B;
  const vals=[];data.forEach(d=>{vals.push(d.ing,d.egr);if(!d.future)vals.push(d.saldo)});
  const sc=niceScale(Math.min(0,...vals),Math.max(1000000,...vals));
  const y=v=>T+ph-(v-sc.min)/(sc.max-sc.min)*ph, band=pw/data.length, bw=Math.min(28,band*.28);
  let s=`<div class="legend"><span><i style="background:var(--bar-in)"></i>Ingresos</span><span><i style="background:var(--bar-out)"></i>Egresos</span><span><i style="background:var(--line-saldo)"></i>Saldo acumulado</span></div><div class="tw"><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px;display:block" role="img" aria-label="Ingresos, egresos y saldo acumulado de caja por mes">`;
  for(let v=sc.min;v<=sc.max+1e-9;v+=sc.step){s+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end">${cm(v)}</text>`}
  s+=`<line class="ax" x1="${L}" x2="${W-R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  let pts=[];
  data.forEach((d,i)=>{const cx=L+band*i+band/2;
    if(d.ing)s+=`<rect x="${(cx-bw-1).toFixed(1)}" y="${y(d.ing).toFixed(1)}" width="${bw}" height="${(y(0)-y(d.ing)).toFixed(1)}" rx="2" fill="var(--bar-in)"/>`;
    if(d.egr)s+=`<rect x="${(cx+1).toFixed(1)}" y="${y(d.egr).toFixed(1)}" width="${bw}" height="${(y(0)-y(d.egr)).toFixed(1)}" rx="2" fill="var(--bar-out)"/>`;
    const lab=new Date(d.m+'-15T12:00:00').toLocaleDateString('es-CO',{month:'short'}).replace('.','');
    s+=`<text x="${cx.toFixed(1)}" y="${H-10}" text-anchor="middle">${lab}${d.m.endsWith('-01')||i===0?' '+d.m.slice(2,4):''}</text>`;
    if(!d.future)pts.push([cx,y(d.saldo),d.saldo])});
  if(pts.length){s+=`<polyline fill="none" stroke="var(--line-saldo)" stroke-width="2" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`;
    pts.forEach((p,i)=>{s+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===pts.length-1?4.5:3}" fill="var(--surface)" stroke="var(--line-saldo)" stroke-width="2"/>`});
    const lp=pts[pts.length-1];s+=`<text x="${Math.min(lp[0],W-R-4).toFixed(1)}" y="${(lp[1]-10).toFixed(1)}" text-anchor="end" style="fill:var(--fg);font-weight:600">${cm(lp[2])}</text>`}
  return s+'</svg></div>';
}
function stockList(){
  if(!S.productos.length)return emptyHtml('Sin productos','Cree el primer producto en el módulo Productos.');
  return S.productos.map(p=>{const q=D.stock[p.id]||0,mn=+p.stockMin||0;const st=q<=0?pill('Sin stock','bad'):q<=mn?pill('Reponer','warn'):pill('Suficiente','ok');
    return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)"><div style="min-width:0"><div style="font-weight:500">${esc(p.nombre)}</div><div class="mut small">Mínimo ${nf(mn)} und.</div></div><div style="text-align:right"><div class="num" style="font:500 22px var(--f-display)">${nf(q)}</div>${st}</div></div>`}).join('');
}
function medioTable(m){
  const rows=D.cash.filter(r=>mkey(r.f)===m);
  const by={};MEDIOS.forEach(x=>by[x]={i:0,e:0});rows.forEach(r=>{const k=by[r.medio]?r.medio:'Efectivo';r.t==='Ingreso'?by[k].i+=r.m:by[k].e+=r.m});
  const mx=Math.max(1,...Object.values(by).map(x=>x.i));
  if(!rows.length)return emptyHtml('Sin movimientos','No hay ingresos ni egresos registrados en este mes.');
  return tableWrap(`<table><thead><tr><th>Medio</th><th></th><th class="r">Ingresos</th><th class="r">Egresos</th><th class="r">Neto</th></tr></thead><tbody>${MEDIOS.map(k=>{const x=by[k];return `<tr><td>${k}</td><td style="width:20%"><div class="bar-track"><div class="bar-fill" style="width:${(x.i/mx*100).toFixed(0)}%"></div></div></td><td class="r">${fmt(x.i)}</td><td class="r">${fmt(x.e)}</td><td class="r ${x.i-x.e<0?'down':''}">${fmt(x.i-x.e)}</td></tr>`}).join('')}</tbody></table>`);
}
function lastVentas(){
  const v=[...S.ventas].sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:b.n-a.n).slice(0,6);
  if(!v.length)return emptyHtml('Sin pedidos','Registre la primera venta para verla aquí.',btn('Nueva venta','new','data-kind="venta"','pri'));
  return tableWrap(`<table><tbody>${v.map(x=>`<tr class="click" data-act="edit" data-kind="venta" data-id="${x.id}"><td><b>VT-${pad(x.n)}</b><div class="mut small">${fdate(x.fecha)} · ${esc((D.C[x.clienteId]&&D.C[x.clienteId].nombre)||'Cliente ocasional')}</div></td><td class="r">${fmt(x.total)}<div>${estPill(x.estado)}</div></td></tr>`).join('')}</tbody></table>`);
}
const estPill=e=>pill(e,e==='Pagado'||e==='Recibida'?'ok':e==='Pendiente'||e==='Pedida'?'warn':'neu');

function exportBtn(name){return btn('Exportar CSV','csv',`data-name="${name}"`)}
function vVentas(){
  const m=UI.fmes||curMonth();
  setHead('Ventas','Ventas aprobadas desde las solicitudes de pedido, por mes. El cobro se gestiona en Cartera',monthInput('fmes',m,false,true)+`<select class="inp" id="ui_fvend" data-ui="fvend"><option value="">Todos los vendedores</option>${VENDEDORES.map(x=>`<option ${x===UI.fvend?'selected':''}>${x}</option>`).join('')}</select>`+exportBtn('ventas')+`<a class="btn pri" href="#pedidos">Ir a solicitudes de pedido</a>`);
  const legacy=S.ventas.filter(v=>!v.pedidoId&&!v.ejemplo).length;
  const rows=S.ventas.filter(v=>(v.pedidoId||v.ejemplo||UI.vleg)&&mkey(v.fecha)===m&&(!UI.fvend||v.vendedor===UI.fvend)).sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:b.n-a.n);
  const ok=rows.filter(v=>v.estado!=='Anulado');
  const chips=`<div class="chips"><span class="chip">Ventas <b>${ok.length}</b></span><span class="chip">Total del mes <b>${fmt(ok.reduce((a,v)=>a+v.total,0))}</b></span></div>`;
  const leg=legacy?`<div class="banner"><p><b>${legacy} venta${legacy===1?'':'s'} anterior${legacy===1?'':'es'} sin solicitud de pedido</b> ${UI.vleg?'se muestran':'no se muestran'} en esta lista, pero ${legacy===1?'sigue':'siguen'} contando en el Dashboard, la cartera y el inventario.</p>${btn(UI.vleg?'Ocultarlas':'Mostrarlas','vleg')}</div>`:'';
  if(!rows.length)return leg+chips+`<div class="card">${emptyHtml('Sin ventas en '+mname(m),'Las ventas se crean al aprobar una solicitud de pedido. Para registrar ventas de octubre, cree la solicitud con la fecha de la venta y apruébela.','<a class="btn pri" href="#pedidos">Ir a solicitudes de pedido</a>')}</div>`;
  return leg+chips+`<div class="card">${tableWrap(`<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th class="r">Valor</th><th>Vendedor</th><th class="r"></th></tr></thead><tbody>${rows.map(v=>`<tr><td>${fdate(v.fecha)}</td><td><b>${esc((D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional')}</b>${v.ejemplo?' '+pill('Ejemplo','gold'):''}</td><td class="small">${itemsTxt(v.items)}</td><td class="r">${fmt(v.total)}</td><td>${esc(v.vendedor||'Sin asignar')}</td><td class="r" style="white-space:nowrap"><button class="btn sm" data-act="edit" data-kind="venta" data-id="${v.id}">Editar</button> <button class="btn sm danger" data-act="del" data-kind="venta" data-id="${v.id}">Borrar</button></td></tr>`).join('')}</tbody></table>`)}</div>`;
}
function vCompras(){
  const m=UI.fmes,est=UI.fest;
  setHead('Órdenes de compra','Al recibir una orden, las unidades entran al inventario; al pagarla, el egreso sale de caja con su medio de pago',monthInput('fmes',m,true)+`<select class="inp" id="ui_fest" data-ui="fest"><option value="">Todos los estados</option>${['Pedida','Recibida','Anulada'].map(x=>`<option ${x===est?'selected':''}>${x}</option>`).join('')}</select>`+exportBtn('compras')+btn('Nueva orden','new','data-kind="compra"','pri'));
  const rows=S.compras.filter(o=>(!m||mkey(o.fecha)===m)&&(!est||o.estado===est)).sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:b.n-a.n);
  const ok=rows.filter(o=>o.estado!=='Anulada');
  const chips=`<div class="chips"><span class="chip">Órdenes <b>${ok.length}</b></span><span class="chip">Comprado <b>${fmt(ok.reduce((a,o)=>a+o.total,0))}</b></span><span class="chip">Pagado <b>${fmt(ok.filter(o=>o.pago==='Pagado').reduce((a,o)=>a+o.total,0))}</b></span><span class="chip">Por pagar <b>${fmt(ok.filter(o=>o.pago==='Pendiente').reduce((a,o)=>a+o.total,0))}</b></span></div>`;
  if(!rows.length)return chips+`<div class="card">${emptyHtml('Sin órdenes de compra','Registre lo que le compra a su productor o proveedor. Cada recepción actualiza el inventario y el costo promedio.',btn('Nueva orden','new','data-kind="compra"','pri'))}</div>`;
  return chips+`<div class="card">${tableWrap(`<table><thead><tr><th>N.º</th><th>Fecha</th><th>Proveedor</th><th>Ítems</th><th>Estado</th><th>Entrada a inventario</th><th>Pago</th><th class="r">Total</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr class="click" data-act="edit" data-kind="compra" data-id="${o.id}"><td><b>OC-${pad(o.n)}</b>${o.ejemplo?' '+pill('Ejemplo','gold'):''}</td><td>${fdate(o.fecha)}</td><td>${esc(o.proveedor||'')}</td><td class="small">${itemsTxt(o.items)}</td><td>${estPill(o.estado)}</td><td>${o.estado==='Recibida'?pill('Registrada '+fdate(o.fechaRecibo||o.fecha),'ok'):o.estado==='Anulada'?'—':pill('Pendiente','warn')}</td><td>${o.estado==='Anulada'?'—':estPill(o.pago)+`<div class="mut small">${esc(o.medio||'')}</div>`}</td><td class="r">${fmt(o.total)}</td><td class="r" style="white-space:nowrap">${o.estado==='Pedida'?`<button class="btn sm" data-act="recibir" data-id="${o.id}">Recibir</button> `:''}${o.pago==='Pendiente'&&o.estado!=='Anulada'?`<button class="btn sm" data-act="pagar" data-id="${o.id}">Pagar</button>`:''}</td></tr>`).join('')}</tbody></table>`)}</div>`;
}
function vInventario(){
  setHead('Inventario','Las entradas vienen de las órdenes de compra recibidas y las salidas de las ventas; el saldo se calcula solo',`<select class="inp" id="ui_fprod" data-ui="fprod"><option value="">Todos los productos</option>${S.productos.map(p=>`<option value="${p.id}" ${p.id===UI.fprod?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select><select class="inp" id="ui_ftipo" data-ui="ftipo"><option value="">Todos los tipos</option>${['Entrada','Salida','Ajuste'].map(x=>`<option ${x===UI.ftipo?'selected':''}>${x}</option>`).join('')}</select>`+exportBtn('inventario')+btn('Ajuste o merma','new','data-kind="ajuste"','pri'));
  let h=`<div class="card"><h2>Existencias</h2>`;
  if(!S.productos.length)h+=emptyHtml('Sin productos','Cree sus productos para controlar el inventario.');
  else h+=tableWrap(`<table><thead><tr><th>Producto</th><th class="r">Entradas</th><th class="r">Salidas</th><th class="r">Ajustes</th><th class="r">Stock</th><th class="r">Mínimo</th><th class="r">Costo promedio</th><th class="r">Valor</th></tr></thead><tbody>${S.productos.map(p=>{const q=D.stock[p.id]||0,mn=+p.stockMin||0;return `<tr><td><b>${esc(p.nombre)}</b></td><td class="r">${nf(D.ent[p.id]||0)}</td><td class="r">${nf(-(D.sal[p.id]||0))}</td><td class="r">${nf(D.aj[p.id]||0)}</td><td class="r"><b>${nf(q)}</b> ${q<=0?pill('Sin stock','bad'):q<=mn?pill('Reponer','warn'):''}</td><td class="r">${nf(mn)}</td><td class="r">${fmt(D.cp(p.id))}</td><td class="r">${fmt(Math.max(0,q)*D.cp(p.id))}</td></tr>`}).join('')}</tbody></table>`);
  h+='</div>';
  const rows=D.inv.filter(r=>(!UI.fprod||r.pid===UI.fprod)&&(!UI.ftipo||r.t===UI.ftipo)).slice().reverse();
  h+=`<div class="card" style="margin-top:16px"><h2>Movimientos de inventario</h2>`;
  if(!rows.length)h+=emptyHtml('Sin movimientos','Aparecerán al recibir órdenes de compra, registrar ventas o hacer ajustes.');
  else h+=tableWrap(`<table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="r">Cantidad</th><th class="r">Saldo</th><th>Referencia</th><th>Detalle</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fdate(r.f)}</td><td>${esc(pname(r.pid))}</td><td>${pill(r.t,r.t==='Entrada'?'ok':r.t==='Salida'?'neu':'warn')}</td><td class="r ${r.q<0?'down':'up'}">${r.q>0?'+':''}${nf(r.q)}</td><td class="r">${nf(r.saldo)}</td><td>${r.rk==='ajuste'?`<button class="link" data-act="edit" data-kind="ajuste" data-id="${r.rid}">Ajuste</button>`:`<button class="link" data-act="edit" data-kind="${r.rk}" data-id="${r.rid}">${r.ref}</button>`}</td><td class="small mut">${esc(r.det)}</td></tr>`).join('')}</tbody></table>`);
  return h+'</div>';
}
function vCaja(){
  const m=UI.fmes,md=UI.fmed;
  setHead('Flujo de caja','Cada venta cobrada y cada compra pagada llega aquí con el medio de pago del pedido',monthInput('fmes',m,true)+`<select class="inp" id="ui_fmed" data-ui="fmed"><option value="">Todos los medios</option>${MEDIOS.map(x=>`<option ${x===md?'selected':''}>${x}</option>`).join('')}</select>`+exportBtn('caja')+btn('Registrar movimiento','new','data-kind="mov"','pri'));
  const rows=D.cash.filter(r=>(!m||mkey(r.f)===m)&&(!md||r.medio===md));
  const ing=rows.filter(r=>r.t==='Ingreso').reduce((a,r)=>a+r.m,0),egr=rows.filter(r=>r.t==='Egreso').reduce((a,r)=>a+r.m,0);
  let h=`<div class="grid g4" style="margin-bottom:16px"><div class="card kpi sm"><span class="lab">Saldo actual</span><span class="val num">${fmt(D.saldo)}</span></div><div class="card kpi sm"><span class="lab">Ingresos del filtro</span><span class="val num up">${fmt(ing)}</span></div><div class="card kpi sm"><span class="lab">Egresos del filtro</span><span class="val num down">${fmt(egr)}</span></div><div class="card kpi sm"><span class="lab">Neto del filtro</span><span class="val num">${fmt(ing-egr)}</span></div></div>`;
  const by={};MEDIOS.forEach(x=>by[x]={i:0,e:0});rows.forEach(r=>{const k=by[r.medio]?r.medio:'Efectivo';r.t==='Ingreso'?by[k].i+=r.m:by[k].e+=r.m});
  h+=`<div class="card" style="margin-bottom:16px"><h2>Resumen por medio de pago</h2>${tableWrap(`<table><thead><tr><th>Medio de pago</th><th class="r">Ingresos</th><th class="r">Egresos</th><th class="r">Neto</th></tr></thead><tbody>${MEDIOS.map(k=>`<tr><td>${k}</td><td class="r">${fmt(by[k].i)}</td><td class="r">${fmt(by[k].e)}</td><td class="r ${by[k].i-by[k].e<0?'down':''}">${fmt(by[k].i-by[k].e)}</td></tr>`).join('')}</tbody></table>`)}</div>`;
  h+=`<div class="card"><h2>Movimientos</h2>`;
  if(!rows.length)h+=emptyHtml('Sin movimientos de caja','Registre el aporte inicial o cobre una venta para ver el flujo.',btn('Registrar aporte inicial','new','data-kind="mov" data-preset="aporte"','pri'));
  else h+=tableWrap(`<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Origen</th><th>Medio</th><th class="r">Ingreso</th><th class="r">Egreso</th><th class="r">Saldo</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr class="click" data-act="${r.rk==='caja'?'edit':'edit'}" data-kind="${r.rk==='caja'?'mov':r.rk}" data-id="${r.rid}"><td>${fdate(r.f)}</td><td>${esc(r.con)}${r.ref?`<div class="mut small">${r.ref}</div>`:`<div class="mut small">${esc(r.cat||'')}</div>`}</td><td>${pill(r.orig,r.orig==='Manual'?'neu':'gold')}</td><td>${esc(r.medio||'')}</td><td class="r up">${r.t==='Ingreso'?fmt(r.m):''}</td><td class="r down">${r.t==='Egreso'?fmt(r.m):''}</td><td class="r"><b>${fmt(r.saldo)}</b></td></tr>`).join('')}</tbody></table>`);
  return h+'</div>';
}
function vClientes(){
  setHead('CRM','Relación comercial con restaurantes, bares, tiendas y consumidores',`<input class="inp search" id="ui_q" data-ui="q" placeholder="Buscar cliente" value="${esc(UI.q)}"><select class="inp" id="ui_fcli" data-ui="fcli"><option value="">Todos los estados</option>${['Prospecto','Activo','Inactivo'].map(x=>`<option ${x===UI.fcli?'selected':''}>${x}</option>`).join('')}</select>`+btn('Nuevo cliente','new','data-kind="cliente"','pri'));
  const q=UI.q.toLowerCase();
  const rows=S.clientes.filter(c=>(!UI.fcli||c.estado===UI.fcli)&&(!q||[c.nombre,c.contacto,c.ciudad,c.tipo].join(' ').toLowerCase().includes(q))).map(c=>{const vs=D.vOk.filter(v=>v.clienteId===c.id);return {c,n:vs.length,t:vs.reduce((a,v)=>a+v.total,0),pend:vs.reduce((a,v)=>a+v.saldo,0),last:vs.reduce((a,v)=>v.fecha>a?v.fecha:a,'')}}).sort((a,b)=>b.t-a.t);
  if(!rows.length)return `<div class="card">${emptyHtml(S.clientes.length?'Sin resultados':'Aún no hay clientes','Registre sus clientes para seguir pedidos, cartera y frecuencia de compra.',btn('Nuevo cliente','new','data-kind="cliente"','pri'))}</div>`;
  return `<div class="card">${tableWrap(`<table><thead><tr><th>Cliente</th><th>Tipo</th><th>Contacto</th><th>Estado</th><th class="r">Pedidos</th><th class="r">Comprado</th><th class="r">Por cobrar</th><th>Último pedido</th></tr></thead><tbody>${rows.map(x=>`<tr class="click" data-act="cliente" data-id="${x.c.id}"><td><b>${esc(x.c.nombre)}</b>${x.c.ejemplo?' '+pill('Ejemplo','gold'):''}<div class="mut small">${esc(x.c.ciudad||'')}</div></td><td>${esc(x.c.tipo||'')}</td><td class="small">${esc(x.c.contacto||'')}<div class="mut">${esc(x.c.tel||'')}</div></td><td>${pill(x.c.estado||'Prospecto',x.c.estado==='Activo'?'ok':x.c.estado==='Inactivo'?'neu':'warn')}</td><td class="r">${x.n}</td><td class="r">${fmt(x.t)}</td><td class="r ${x.pend?'down':''}">${fmt(x.pend)}</td><td>${fdate(x.last)}</td></tr>`).join('')}</tbody></table>`)}</div>`;
}
function prodImg(p){return p.etiquetaImg?p.etiquetaImg:p.etiqueta==='ambar'?IMG.labAmber:p.etiqueta==='roja'?IMG.labRed:''}
function vProductos(){
  setHead('Productos','Catálogo con etiqueta, características y costo',btn('Nuevo producto','new','data-kind="producto"','pri'));
  if(!S.productos.length)return `<div class="card">${emptyHtml('Sin productos','Cree la primera referencia de cerveza con su costo y precio.',btn('Nuevo producto','new','data-kind="producto"','pri'))}</div>`;
  return `<div class="pgrid">${S.productos.map(p=>{const cpv=D.cp(p.id),mg=p.precio>0?((p.precio-cpv)/p.precio*100):null,img=prodImg(p);
    return `<article class="pcard" data-act="prod" data-id="${p.id}" tabindex="0"><div class="pimg ${img?'':'ph'}">${img?`<img src="${img}" alt="Etiqueta de ${esc(p.nombre)}">`:'Sin imagen de etiqueta'}</div><div class="pbody"><h3>${esc(p.nombre)}</h3><div class="spec"><span>${esc(p.estilo||'')}</span>${p.abv?`<span>${nf(p.abv)}% alc.</span>`:''}${p.ibu?`<span>IBU ${nf(p.ibu)}</span>`:''}${p.ml?`<span>${nf(p.ml)} ml</span>`:''}</div><div class="pm"><div><small>Costo</small><b>${cpv?fmt(cpv):'Sin definir'}</b></div><div><small>Precio</small><b>${p.precio?fmt(p.precio):'Sin definir'}</b></div><div><small>Margen</small><b>${mg===null||!cpv?'—':mg.toFixed(0)+'%'}</b></div></div><div class="mut small">Stock actual: <b>${nf(D.stock[p.id]||0)}</b> und.</div></div></article>`}).join('')}</div>`;
}
function vInversion(){
  setHead('Inversión inicial','Capital aportado, inversión de arranque y recuperación a partir de octubre de 2026',btn('Registrar aporte','new','data-kind="mov" data-preset="aporte"')+btn('Registrar inversión','new','data-kind="mov" data-preset="inversion"','pri'));
  const aporte=D.cash.filter(r=>r.cat==='Aporte de socios'&&r.t==='Ingreso').reduce((a,r)=>a+r.m,0);
  const inv=D.cash.filter(r=>r.cat==='Inversión inicial'&&r.t==='Egreso').reduce((a,r)=>a+r.m,0);
  const oper=D.cash.filter(r=>r.cat!=='Aporte de socios'&&r.cat!=='Inversión inicial').reduce((a,r)=>a+(r.t==='Ingreso'?r.m:-r.m),0);
  const rec=inv>0?Math.max(0,oper)/inv*100:null;
  let h=`<div class="grid g4"><div class="card kpi sm"><span class="lab">Capital aportado</span><span class="val num">${fmt(aporte)}</span><span class="note">Base del flujo de caja</span></div><div class="card kpi sm"><span class="lab">Invertido en arranque</span><span class="val num">${fmt(inv)}</span><span class="note">Egresos de categoría Inversión inicial</span></div><div class="card kpi sm"><span class="lab">Saldo de caja</span><span class="val num">${fmt(D.saldo)}</span><span class="note">Disponible hoy</span></div><div class="card kpi sm"><span class="lab">Flujo operativo acumulado</span><span class="val num ${oper<0?'down':''}">${fmt(oper)}</span><span class="note">Sin aportes ni inversión inicial</span></div></div>`;
  h+=`<div class="card" style="margin-top:16px"><h2>Recuperación de la inversión</h2>${rec===null?`<p class="mut" style="margin:0">Registre la inversión de arranque (equipos, adecuaciones, registros sanitarios) para medir cuánto se ha recuperado con la operación.</p>`:`<div class="kv"><dt>Flujo operativo acumulado</dt><dd>${fmt(oper)}</dd><dt>Inversión de arranque</dt><dd>${fmt(inv)}</dd><dt>Recuperado</dt><dd>${rec.toFixed(1)}%</dd></div><div class="meter"><i style="width:${Math.min(100,rec).toFixed(1)}%"></i></div>`}</div>`;
  const rows=D.cash.filter(r=>r.cat==='Aporte de socios'||r.cat==='Inversión inicial').slice().reverse();
  h+=`<div class="card" style="margin-top:16px"><h2>Aportes e inversión registrados</h2>`;
  h+=rows.length?tableWrap(`<table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Medio</th><th class="r">Monto</th></tr></thead><tbody>${rows.map(r=>`<tr class="click" data-act="edit" data-kind="mov" data-id="${r.rid}"><td>${fdate(r.f)}</td><td>${esc(r.con)}</td><td>${pill(r.cat,r.t==='Ingreso'?'ok':'gold')}</td><td>${esc(r.medio||'')}</td><td class="r ${r.t==='Ingreso'?'up':'down'}">${r.t==='Egreso'?'−':''}${fmt(r.m)}</td></tr>`).join('')}</tbody></table>`):emptyHtml('Sin registros','Comience con el aporte inicial de los socios; es la primera línea del flujo de caja.',btn('Registrar aporte inicial','new','data-kind="mov" data-preset="aporte"','pri'));
  return h+'</div>';
}
function vCartera(){
  const t=todayStr(),cid=UI.fcli;
  setHead('Cartera','Ventas a crédito y saldos por cobrar, con vencimiento, abonos y cupo por cliente',`<select class="inp" id="ui_fcli" data-ui="fcli"><option value="">Todos los clientes</option>${S.clientes.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>`+exportBtn('cartera')+btn('Nueva solicitud a crédito','new','data-kind="pedido" data-preset="credito"','pri'));
  const rows=S.ventas.filter(v=>v.estado==='Pendiente'&&v.saldo>0&&(!cid||v.clienteId===cid)).map(v=>({v,d:dayDiff(v.vence,t)})).sort((a,b)=>a.v.vence<b.v.vence?-1:a.v.vence>b.v.vence?1:a.v.n-b.v.n);
  const sum=f=>rows.filter(f).reduce((a,r)=>a+r.v.saldo,0);
  const total=sum(()=>true),venc=sum(r=>r.d>0),nCli=new Set(rows.map(r=>r.v.clienteId||'_')).size;
  let h=`<div class="grid g4"><div class="card kpi sm"><span class="lab">Cartera total</span><span class="val num">${fmt(total)}</span><span class="note">${rows.length} pedido${rows.length===1?'':'s'} con saldo</span></div><div class="card kpi sm"><span class="lab">Cartera vencida</span><span class="val num ${venc?'down':''}">${fmt(venc)}</span><span class="note">${total?(venc/total*100).toFixed(0):0}% de la cartera</span></div><div class="card kpi sm"><span class="lab">Por vencer</span><span class="val num">${fmt(total-venc)}</span><span class="note">Dentro del plazo</span></div><div class="card kpi sm"><span class="lab">Clientes con saldo</span><span class="val num">${nCli}</span><span class="note">Cobrado a la fecha: ${fmt(S.ventas.filter(v=>v.estado!=='Anulado').reduce((a,v)=>a+v.total-v.saldo,0))}</span></div></div>`;
  const paidCard=()=>{const ps=S.ventas.filter(v=>v.estado==='Pagado'&&(!cid||v.clienteId===cid)).sort((a,b)=>(b.fechaPago||b.fecha)<(a.fechaPago||a.fecha)?-1:1);if(!ps.length)return '';return `<div class="card" style="margin-top:16px"><h2>Pedidos pagados</h2>${tableWrap(`<table><thead><tr><th>N.º</th><th>Cliente</th><th>Fecha</th><th>Pagado el</th><th class="r">Total</th><th></th></tr></thead><tbody>${ps.map(v=>`<tr><td><b>VT-${pad(v.n)}</b></td><td>${esc((D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional')}${v.vendedor?`<div class="mut small">${esc(v.vendedor)}</div>`:''}</td><td>${fdate(v.fecha)}</td><td>${fdate(v.fechaPago||v.fecha)}${(v.abonos||[]).length?`<div class="mut small">${v.abonos.length} pago${v.abonos.length===1?'':'s'}</div>`:''}</td><td class="r">${fmt(v.total)}</td><td class="r">${(v.abonos||[]).length?`<button class="btn sm" data-act="abono" data-id="${v.id}">Ver pagos</button>`:''}</td></tr>`).join('')}</tbody></table>`)}</div>`};
  if(!rows.length)return h+paidCard().replace('<div class="card" style="margin-top:16px">','<div class="card" style="margin-top:16px">')+`<div class="card" style="margin-top:16px">${emptyHtml('Sin cartera pendiente','Cuando se apruebe un pedido a crédito, el saldo aparece aquí con su fecha de vencimiento. Registre los abonos a medida que el cliente pague y cada uno entra a caja.',btn('Nueva solicitud a crédito','new','data-kind="pedido" data-preset="credito"','pri'))}</div>`;
  const B=[['Al día',r=>r.d<=0],['1 a 30 días',r=>r.d>=1&&r.d<=30],['31 a 60 días',r=>r.d>=31&&r.d<=60],['61 a 90 días',r=>r.d>=61&&r.d<=90],['Más de 90 días',r=>r.d>90]];
  const mx=Math.max(1,...B.map(b=>sum(b[1])));
  h+=`<div class="card" style="margin-top:16px"><h2>Antigüedad de la cartera</h2><div class="bars">${B.map((b,i)=>{const s=sum(b[1]);return `<div class="bar-row"><span style="white-space:nowrap">${b[0]}</span><div class="bar-track"><div class="bar-fill" style="width:${(s/mx*100).toFixed(0)}%;${i?'background:var(--bar-out)':''}"></div></div><b class="num">${fmt(s)}</b></div>`}).join('')}</div></div>`;
  const g={};rows.forEach(r=>{const k=r.v.clienteId||'';const x=g[k]||(g[k]={k,n:0,s:0,vc:0,mx:0});x.n++;x.s+=r.v.saldo;if(r.d>0){x.vc+=r.v.saldo;x.mx=Math.max(x.mx,r.d)}});
  h+=`<div class="card" style="margin-top:16px"><h2>Saldo por cliente</h2>${tableWrap(`<table><thead><tr><th>Cliente</th><th class="r">Pedidos</th><th class="r">Saldo</th><th class="r">Vencido</th><th class="r">Mayor atraso</th><th class="r">Cupo</th><th class="r">Cupo disponible</th></tr></thead><tbody>${Object.values(g).sort((a,b)=>b.s-a.s).map(x=>{const c=D.C[x.k],cu=c&&+c.cupo||0;return `<tr ${c?`class="click" data-act="cliente" data-id="${c.id}"`:''}><td><b>${esc(c?c.nombre:'Cliente ocasional')}</b></td><td class="r">${x.n}</td><td class="r">${fmt(x.s)}</td><td class="r ${x.vc?'down':''}">${fmt(x.vc)}</td><td class="r">${x.mx?x.mx+' días':'—'}</td><td class="r">${cu?fmt(cu):'—'}</td><td class="r">${cu?(x.s>cu?pill('Excede el cupo','bad'):fmt(cu-x.s)):'—'}</td></tr>`}).join('')}</tbody></table>`)}</div>`;
  h+=`<div class="card" style="margin-top:16px"><h2>Pedidos con saldo</h2>${tableWrap(`<table><thead><tr><th>N.º</th><th>Cliente</th><th>Fecha</th><th>Vence</th><th>Situación</th><th class="r">Total</th><th class="r">Abonado</th><th class="r">Saldo</th><th></th></tr></thead><tbody>${rows.map(({v,d})=>`<tr class="click" data-act="edit" data-kind="venta" data-id="${v.id}"><td><b>VT-${pad(v.n)}</b></td><td>${esc((D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional')}</td><td>${fdate(v.fecha)}</td><td>${fdate(v.vence)}${v.condicion==='Crédito'?`<div class="mut small">${v.plazo||0} días</div>`:''}</td><td>${d>0?pill('Vencida hace '+d+' d','bad'):d===0?pill('Vence hoy','warn'):pill('Vence en '+(-d)+' d',-d<=7?'warn':'neu')}</td><td class="r">${fmt(v.total)}</td><td class="r">${fmt(v.abonado)}</td><td class="r"><b>${fmt(v.saldo)}</b></td><td class="r" style="white-space:nowrap"><button class="btn sm" data-act="abono" data-id="${v.id}">Registrar pago</button></td></tr>`).join('')}</tbody></table>`)}</div>`;
  return h+paidCard();
}
const locName=a=>a.ubic==='Otro lugar'&&a.otroLugar?a.otroLugar:(a.ubic||'Sin ubicación');
const actVal=a=>(+a.cant||0)*(+a.valor||0);
function vActivos(){
  setHead('Activos de fábrica','Equipos y bienes de la cervecería por ubicación, estado y valor; independiente del inventario de producto',`<input class="inp search" id="ui_aq" data-ui="aq" placeholder="Buscar equipo, marca o serial" value="${esc(UI.aq)}"><select class="inp" id="ui_aloc" data-ui="aloc"><option value="">Todas las ubicaciones</option>${UBICS.map(x=>`<option ${x===UI.aloc?'selected':''}>${x}</option>`).join('')}</select><select class="inp" id="ui_acat" data-ui="acat"><option value="">Todas las categorías</option>${CAT_ACT.map(x=>`<option ${x===UI.acat?'selected':''}>${x}</option>`).join('')}</select><select class="inp" id="ui_aest" data-ui="aest"><option value="">Todos los estados</option>${EST_ACT.map(x=>`<option ${x===UI.aest?'selected':''}>${x}</option>`).join('')}</select>`+exportBtn('activos')+btn('Nuevo activo','new','data-kind="activo"','pri'));
  if(!S.activos.length)return `<div class="card">${emptyHtml('Aún no hay activos registrados','Registre cada equipo con su ubicación (Galán, Cervecería Andrey, Madrid u otro lugar), estado y valor para saber qué tiene y dónde está.',btn('Nuevo activo','new','data-kind="activo"','pri'))}</div>`;
  const vig=S.activos.filter(a=>a.estado!=='Dado de baja');
  const uds=vig.reduce((s,a)=>s+(+a.cant||0),0),val=vig.reduce((s,a)=>s+actVal(a),0);
  const prob=vig.filter(a=>a.estado==='En mantenimiento'||a.estado==='Fuera de servicio').reduce((s,a)=>s+(+a.cant||0),0);
  const sinVal=vig.filter(a=>!(+a.valor>0)).length;
  let h=`<div class="grid g4"><div class="card kpi sm"><span class="lab">Equipos vigentes</span><span class="val num">${nf(uds)}</span><span class="note">${vig.length} referencia${vig.length===1?'':'s'} registradas</span></div><div class="card kpi sm"><span class="lab">Valor de adquisición</span><span class="val num">${fmt(val)}</span><span class="note">${sinVal?sinVal+' sin valor definido':'Cantidad × valor unitario'}</span></div><div class="card kpi sm"><span class="lab">Operativos</span><span class="val num">${nf(vig.filter(a=>a.estado==='Operativo').reduce((s,a)=>s+(+a.cant||0),0))}</span><span class="note">Listos para producir</span></div><div class="card kpi sm"><span class="lab">Requieren atención</span><span class="val num ${prob?'down':''}">${nf(prob)}</span><span class="note">En mantenimiento o fuera de servicio</span></div></div>`;
  const g={};UBICS.forEach(u=>g[u]={u,n:0,r:0,v:0,ok:0,aten:0,otros:new Set()});
  vig.forEach(a=>{const k=UBICS.includes(a.ubic)?a.ubic:'Otro lugar',x=g[k];x.n+=+a.cant||0;x.r++;x.v+=actVal(a);if(a.estado==='Operativo')x.ok+=+a.cant||0;else x.aten+=+a.cant||0;if(k==='Otro lugar'&&a.otroLugar)x.otros.add(a.otroLugar)});
  h+=`<div class="card" style="margin-top:16px"><h2>Por ubicación</h2>${tableWrap(`<table><thead><tr><th>Ubicación</th><th class="r">Referencias</th><th class="r">Equipos</th><th class="r">Operativos</th><th class="r">Con novedad</th><th class="r">Valor</th></tr></thead><tbody>${Object.values(g).map(x=>`<tr><td><b>${esc(x.u)}</b>${x.otros.size?`<div class="mut small">${[...x.otros].map(esc).join(', ')}</div>`:''}</td><td class="r">${x.r}</td><td class="r">${nf(x.n)}</td><td class="r">${nf(x.ok)}</td><td class="r ${x.aten?'down':''}">${nf(x.aten)}</td><td class="r">${fmt(x.v)}</td></tr>`).join('')}</tbody></table>`)}</div>`;
  const q=UI.aq.toLowerCase();
  const rows=S.activos.filter(a=>(!UI.aloc||a.ubic===UI.aloc)&&(!UI.acat||a.categoria===UI.acat)&&(!UI.aest||a.estado===UI.aest)&&(!q||[a.nombre,a.marca,a.modelo,a.serial,a.responsable,a.otroLugar].join(' ').toLowerCase().includes(q))).sort((a,b)=>(a.ubic||'').localeCompare(b.ubic||'','es')||(a.nombre||'').localeCompare(b.nombre||'','es'));
  h+=`<div class="card" style="margin-top:16px"><h2>Listado de activos${rows.length!==S.activos.length?` <span class="mut small">· ${rows.length} de ${S.activos.length}</span>`:''}</h2>`;
  h+=rows.length?tableWrap(`<table><thead><tr><th>Activo</th><th>Categoría</th><th>Ubicación</th><th>Estado</th><th class="r">Cant.</th><th class="r">Valor unit.</th><th class="r">Valor total</th></tr></thead><tbody>${rows.map(a=>`<tr class="click" data-act="edit" data-kind="activo" data-id="${a.id}"><td><b>${esc(a.nombre)}</b><div class="mut small">${esc([a.marca,a.modelo,a.capacidad,a.serial?'Serie '+a.serial:''].filter(Boolean).join(' · '))}</div></td><td>${esc(a.categoria||'')}</td><td>${esc(locName(a))}${a.responsable?`<div class="mut small">${esc(a.responsable)}</div>`:''}</td><td>${pill(a.estado||'Operativo',a.estado==='Operativo'?'ok':a.estado==='En mantenimiento'?'warn':a.estado==='Fuera de servicio'?'bad':'neu')}</td><td class="r">${nf(a.cant||0)}</td><td class="r">${a.valor?fmt(a.valor):'—'}</td><td class="r">${a.valor?fmt(actVal(a)):'—'}</td></tr>`).join('')}</tbody></table>`):emptyHtml('Sin resultados','Ningún activo coincide con los filtros seleccionados.');
  return h+'</div>';
}
const cotEstado=c=>((c.estado==='Borrador'||c.estado==='Enviada')&&c.vence<todayStr())?'Vencida':c.estado;
const cotName=c=>(D.C[c.clienteId]&&D.C[c.clienteId].nombre)||c.prospecto||'Prospecto';
function vCotizaciones(){
  setHead('Cotizaciones','Ofertas a clientes y prospectos con vigencia; una cotización aceptada se convierte en pedido con un clic',`<select class="inp" id="ui_cest" data-ui="cest"><option value="">Todos los estados</option>${['Borrador','Enviada','Aceptada','Rechazada','Vencida'].map(x=>`<option ${x===UI.cest?'selected':''}>${x}</option>`).join('')}</select><select class="inp" id="ui_fvend" data-ui="fvend"><option value="">Todos los vendedores</option>${VENDEDORES.map(x=>`<option ${x===UI.fvend?'selected':''}>${x}</option>`).join('')}</select>`+btn('Nueva cotización','new','data-kind="cotizacion"','pri'));
  const all=S.cotizaciones.map(c=>({c,e:cotEstado(c)}));
  const rows=all.filter(x=>(!UI.cest||x.e===UI.cest)&&(!UI.fvend||x.c.vendedor===UI.fvend)).sort((a,b)=>a.c.fecha<b.c.fecha?1:a.c.fecha>b.c.fecha?-1:b.c.n-a.c.n);
  const sum=f=>all.filter(f).reduce((a,x)=>a+x.c.total,0),cnt=f=>all.filter(f).length;
  const cerr=cnt(x=>x.e==='Aceptada'),perd=cnt(x=>x.e==='Rechazada'||x.e==='Vencida');
  const chips=`<div class="chips"><span class="chip">Cotizadas <b>${all.length}</b> · ${fmt(sum(()=>true))}</span><span class="chip">Abiertas <b>${fmt(sum(x=>x.e==='Borrador'||x.e==='Enviada'))}</b></span><span class="chip">Aceptadas <b>${fmt(sum(x=>x.e==='Aceptada'))}</b></span><span class="chip">Tasa de cierre <b>${cerr+perd?Math.round(cerr/(cerr+perd)*100)+'%':'—'}</b></span></div>`;
  if(!rows.length)return chips+`<div class="card">${emptyHtml(S.cotizaciones.length?'Sin resultados':'Aún no hay cotizaciones','Cotice a clientes y prospectos con una vigencia; cuando acepten, conviértalas en pedido sin volver a digitar.',btn('Nueva cotización','new','data-kind="cotizacion"','pri'))}</div>`;
  return chips+`<div class="card">${tableWrap(`<table><thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Vigencia</th><th>Estado</th><th class="r">Total</th><th></th></tr></thead><tbody>${rows.map(({c,e})=>{const vt=c.ventaId?S.ventas.find(v=>v.id===c.ventaId):null,pq=c.pedidoId?S.pedidos.find(q=>q.id===c.pedidoId):null;return `<tr class="click" data-act="edit" data-kind="cotizacion" data-id="${c.id}"><td><b>CT-${pad(c.n)}</b></td><td>${fdate(c.fecha)}</td><td>${esc(cotName(c))}${c.vendedor?`<div class="mut small">${esc(c.vendedor)}</div>`:''}</td><td class="small">${itemsTxt(c.items)}</td><td>${fdate(c.vence)}</td><td>${pill(e,e==='Aceptada'?'ok':e==='Enviada'?'gold':e==='Rechazada'?'bad':e==='Vencida'?'warn':'neu')}${vt?`<div class="mut small">Venta VT-${pad(vt.n)}</div>`:pq?`<div class="mut small">Pedido PD-${pad(pq.n)}</div>`:''}</td><td class="r">${fmt(c.total)}</td><td class="r" style="white-space:nowrap">${!c.ventaId&&!c.pedidoId&&(e==='Aceptada'||e==='Enviada'||e==='Borrador')?`<button class="btn sm" data-act="cotventa" data-id="${c.id}">Convertir en pedido</button>`:''}</td></tr>`}).join('')}</tbody></table>`)}</div>`;
}
function ventaFromPedido(q){const cred=q.condicion==='Crédito',vf=q.fecha||todayStr();return {fecha:vf,clienteId:q.clienteId||'',vendedor:q.vendedor||'',estado:cred?'Pendiente':'Pagado',medio:cred?'Transferencia':'Efectivo',fechaPago:cred?'':vf,condicion:cred?'Crédito':'Contado',plazo:cred?(+q.plazo||30):0,items:q.items,nota:'Desde pedido PD-'+pad(q.n)+(q.nota?' · '+q.nota:''),pedidoId:q.id}}
function excedeCupo(q){const c=D.C[q.clienteId],cu=c&&+c.cupo||0;if(!cu)return false;const saldo=S.ventas.reduce((a,v)=>a+(v.clienteId===q.clienteId?(v.saldo||0):0),0);return saldo>cu}
function pedFalta(q){const need={};(q.items||[]).forEach(i=>{need[i.pid]=(need[i.pid]||0)+(+i.cant||0)});return Object.keys(need).filter(pid=>need[pid]>(D.stock[pid]||0))}
function vPedidos(){
  setHead('Solicitud de pedidos','Los vendedores suben aquí sus pedidos; cada pedido genera su venta: el efectivo entra al Flujo de caja y el crédito pasa a Cartera',`<select class="inp" id="ui_pvend" data-ui="pvend"><option value="">Todos los vendedores</option>${VENDEDORES.map(x=>`<option ${x===UI.pvend?'selected':''}>${x}</option>`).join('')}</select>`+btn('Nuevo pedido','new','data-kind="pedido"','pri'));
  const rows=S.pedidos.filter(q=>!UI.pvend||q.vendedor===UI.pvend).sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:b.n-a.n);
  const chips=`<div class="chips"><span class="chip">Pedidos <b>${rows.length}</b> · ${fmt(rows.reduce((a,q)=>a+q.total,0))}</span>${VENDEDORES.map(v=>`<span class="chip">${esc(v)} <b>${S.pedidos.filter(q=>q.vendedor===v).length}</b></span>`).join('')}</div>`;
  if(!rows.length)return chips+`<div class="card">${emptyHtml(S.pedidos.length?'Sin resultados':'Aún no hay pedidos','Cada vendedor sube aquí el pedido de su cliente indicando si es en efectivo o a crédito. Se crea la venta y se cruza con el Flujo de caja o con Cartera.',btn('Nuevo pedido','new','data-kind="pedido"','pri'))}</div>`;
  return chips+`<div class="card">${tableWrap(`<table><thead><tr><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th>Productos</th><th>Entrega</th><th>Forma de pago</th><th class="r">Total</th><th class="r"></th></tr></thead><tbody>${rows.map(q=>{const neg=(q.items||[]).some(i=>(D.stock[i.pid]||0)<0);const lv=q.ventaId&&S.ventas.find(v=>v.id===q.ventaId);return `<tr><td>${fdate(q.fecha)}</td><td>${esc(q.vendedor||'')}</td><td><b>${esc((D.C[q.clienteId]&&D.C[q.clienteId].nombre)||'—')}</b></td><td class="small">${itemsTxt(q.items)}${q.nota?`<div class="mut">${esc(q.nota)}</div>`:''}</td><td>${q.fechaEntrega?fdate(q.fechaEntrega):'—'}</td><td>${q.condicion==='Crédito'?'Crédito':'Efectivo'}${q.condicion==='Crédito'?`<div class="mut small">${q.plazo||30} días</div>${excedeCupo(q)?`<div>${pill('Excede el cupo','bad')}</div>`:''}`:''}</td><td class="r">${fmt(q.total)}</td><td class="r" style="white-space:nowrap">${lv?'':`<button class="btn sm" data-act="aprobar" data-id="${q.id}">Generar venta</button> `}<button class="btn sm" data-act="edit" data-kind="pedido" data-id="${q.id}">Editar</button> <button class="btn sm danger" data-act="del" data-kind="pedido" data-id="${q.id}">Borrar</button></td></tr>`}).join('')}</tbody></table>`)}</div>`;
}
let BK=null;
const BKLAB={productos:'Productos',clientes:'Clientes',compras:'Órdenes de compra',ventas:'Ventas',movcaja:'Movimientos de caja',ajustes:'Ajustes de inventario',activos:'Activos',cotizaciones:'Cotizaciones',pedidos:'Pedidos'};
const bkClean=x=>{const {id,total,vence,abonado,saldo,...r}=x;return r};
function backupData(){const out={app:'sante-erp',version:1,fecha:new Date().toISOString(),collections:{}};COLS.forEach(c=>{out.collections[c]={};S[c].forEach(x=>{out.collections[c][x.id]=bkClean(x)})});return out}
async function backup(){
  if(!DL)return toast('La descarga no está disponible en esta vista.');
  if(!COLS.every(c=>S.ready[c]))return toast('Espere a que termine de cargar la información.');
  try{await DL.save({filename:'sante-respaldo-'+todayStr()+'.json',data:JSON.stringify(backupData())});try{localStorage.setItem('sante_bk',todayStr())}catch(e){}toast('Copia de seguridad descargada.');render()}
  catch(e){if(e&&e.code!=='declined')toast('No se pudo descargar la copia.')}
}
async function restore(){
  if(!DB)return toast('Esta vista no puede guardar datos.');
  const bk=BK;if(!bk)return;UI.bkarm=false;UI.bkbusy=true;UI.bkprog='Iniciando…';render();
  let ok=0,fail=0;
  for(const c of COLS){const docs=bk.collections[c];if(!docs)continue;
    for(const x of S[c].slice()){if(!(x.id in docs)){if(!await dbDel(c,x.id))fail++}}
    const ent=Object.entries(docs);
    for(let i=0;i<ent.length;i++){if(await dbSet(c,ent[i][0],bkClean(ent[i][1])))ok++;else fail++;
      if(i%5===0){UI.bkprog=BKLAB[c]+': '+(i+1)+' de '+ent.length;const e=document.getElementById('bkprog');if(e)e.textContent=UI.bkprog}}}
  BK=null;UI.bkbusy=false;UI.bkprog='';render();
  toast(fail?'Restauración incompleta: '+fail+' registros no se pudieron guardar. Repita la restauración.':'Copia restaurada: '+ok+' registros.');
}
function vRespaldo(){
  setHead('Copia de seguridad','Descargue toda la información del panel en un archivo y restáurela cuando lo necesite','');
  let last='';try{last=localStorage.getItem('sante_bk')||''}catch(e){}
  const dias=last?dayDiff(last,todayStr()):null,totalReg=COLS.reduce((a,c)=>a+S[c].length,0);
  let h=`<div class="grid g2"><div class="card"><h2>Descargar copia</h2><p style="margin:0 0 4px">Guarda en un solo archivo todo lo registrado: ventas, pedidos, clientes, compras, inventario, caja, cartera, cotizaciones, activos y las imágenes de las etiquetas.</p><div class="bkgrid">${COLS.map(c=>`<div><b class="num">${S[c].length}</b><small>${BKLAB[c]}</small></div>`).join('')}</div><p class="${dias===null||dias>7?'down':'mut'} small" style="margin:0 0 12px">${dias===null?'Aún no ha descargado una copia desde este dispositivo.':'Última copia desde este dispositivo: '+fdate(last)+(dias===0?' (hoy).':' (hace '+dias+' día'+(dias===1?'':'s')+').')}${dias===null||dias>7?' Se recomienda una copia semanal.':''}</p>${btn('Descargar copia de seguridad ('+totalReg+' registros)','backup','','pri')}<p class="mut small" style="margin:12px 0 0">Guarde el archivo en su computador o en Drive. Contiene información del negocio: no lo comparta con terceros.</p></div>`;
  h+=`<div class="card"><h2>Restaurar desde una copia</h2>`;
  if(UI.bkbusy)h+=`<p style="margin:0"><b>Restaurando la información…</b> No cierre esta página.</p><p class="mut" id="bkprog" style="margin:8px 0 0">${esc(UI.bkprog)}</p>`;
  else if(BK){const n=COLS.reduce((a,c)=>a+Object.keys(BK.collections[c]||{}).length,0);
    h+=`<p style="margin:0 0 4px"><b>Archivo listo:</b> copia del ${fdate(String(BK.fecha).slice(0,10))} con ${n} registros.</p><div class="bkgrid">${COLS.filter(c=>BK.collections[c]).map(c=>`<div><b class="num">${Object.keys(BK.collections[c]).length}</b><small>${BKLAB[c]}</small></div>`).join('')}</div><div class="warnbox" style="margin:0 0 12px">Al restaurar se <b>reemplaza toda la información actual</b> del panel por la de este archivo. Lo registrado después de esa copia se pierde. Descargue antes una copia del estado actual si tiene dudas.</div><div class="tools">${btn(UI.bkarm?'Confirmar: reemplazar toda la información':'Restaurar esta copia','restore','','danger')}${btn('Cancelar','bkcancel')}</div>`}
  else h+=`<p style="margin:0 0 12px">Seleccione un archivo de copia descargado desde este panel (sante-respaldo-….json). Primero verá su contenido y nada cambia hasta que confirme.</p><label class="fld"><span>Archivo de copia de seguridad</span><input type="file" id="bkfile" accept=".json,application/json"></label>`;
  return h+'</div></div>';
}
document.addEventListener('change',e=>{const t=e.target;if(!t||t.id!=='bkfile')return;const f=t.files&&t.files[0];if(!f)return;
  const fr=new FileReader();fr.onerror=()=>toast('No se pudo leer el archivo.');
  fr.onload=()=>{try{const o=JSON.parse(fr.result);if(!o||o.app!=='sante-erp'||!o.collections||typeof o.collections!=='object')throw 0;BK=o;UI.bkarm=false;render()}catch(e){toast('El archivo no es una copia de seguridad válida de este panel.');t.value=''}};
  fr.readAsText(f)});
const RENDER={resumen:vResumen,ventas:vVentas,clientes:vClientes,productos:vProductos,compras:vCompras,inventario:vInventario,caja:vCaja,cartera:vCartera,cotizaciones:vCotizaciones,pedidos:vPedidos,activos:vActivos,respaldo:vRespaldo,usuarios:vUsuarios,inversion:vInversion};

function cardTables(root){
  root.querySelectorAll('table').forEach(tb=>{const ths=[...tb.querySelectorAll('thead th')].map(x=>x.textContent.trim());if(!ths.length)return;
    const w=tb.closest('.tw');if(w)w.classList.add('tc');
    tb.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{td.dataset.label=ths[i]||'';
      if(!td.textContent.trim()&&!td.querySelector('button,img,svg')){td.classList.add('nil');return}
      const s=document.createElement('span');s.className='cv';while(td.firstChild)s.appendChild(td.firstChild);td.appendChild(s)}))});
}
new MutationObserver(()=>cardTables(document.getElementById('modal'))).observe(document.getElementById('modal'),{childList:true});
function renderNav(){
  let h='';VIEWS.filter(v=>canView(v[0])).forEach(([id,l,g])=>{if(g)h+=`<div class="grp">${g}</div>`;h+=`<a href="#${id}" title="${l}" aria-label="${l}" class="${UI.view===id?'on':''}" ${UI.view===id?'aria-current="page"':''}><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[id]}</svg>${l}</a>`});
  $('#nav').innerHTML=h;
  const tabs=isAdmin()?[['resumen','Inicio'],['ventas','Ventas'],null,['cartera','Cartera']]:[['pedidos','Pedidos'],['ventas','Ventas'],null,['clientes','CRM']],inTabs=tabs.some(x=>x&&x[0]===UI.view);
  const ic=p=>`<svg viewBox="0 0 16 16" aria-hidden="true">${p}</svg>`;
  $('#tabbar').innerHTML=tabs.map(x=>x?`<a href="#${x[0]}" class="${UI.view===x[0]?'on':''}" ${UI.view===x[0]?'aria-current="page"':''}>${ic(ICONS[x[0]])}${x[1]}</a>`:`<button type="button" class="add" data-act="new" data-kind="pedido" aria-label="Nuevo pedido"><span>${ic('<path d="M8 3v10M3 8h10"/>')}</span>Pedido</button>`).join('')+`<button type="button" data-act="menu" class="${inTabs?'':'on'}" aria-label="Abrir el menú completo">${ic('<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>')}Más</button>`;
}
function render(){
  if(!USER)return;
  const ae=document.activeElement,id=ae&&ae.id&&$('#view').contains(ae)?ae.id:null,pos=ae&&ae.selectionStart;
  D=derive(S);renderNav();
  let body=RENDER[UI.view]();
  if(DB===false)body=`<div class="banner"><p><b>Sin conexión con el servidor.</b> Revise su conexión a internet y recargue la página.</p></div>`+body;
  $('#view').innerHTML=body;cardTables($('#view'));
  if(id){const n=document.getElementById(id);if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}}
}
let raf=0;const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(render)};
function route(){document.body.classList.remove('menu-open');const h=location.hash.slice(1);UI.view=RENDER[h]&&canView(h)?h:(isAdmin()?'resumen':'pedidos');UI.fest='';UI.fcli='';UI.q='';UI.fvend='';UI.vleg=false;UI.cest='';UI.pvend='';UI.pest='';render();window.scrollTo(0,0)}

/* ---------- formularios ---------- */
const fld=(l,n,v='',t='text',x='')=>`<label class="fld"><span>${l}</span><input id="f_${n}" name="${n}" type="${t}" value="${esc(v)}" ${x}></label>`;
const sel=(l,n,opts,v='')=>`<label class="fld"><span>${l}</span><select id="f_${n}" name="${n}">${opts.map(o=>{const [a,b]=Array.isArray(o)?o:[o,o];return `<option value="${esc(a)}" ${String(a)===String(v)?'selected':''}>${esc(b)}</option>`}).join('')}</select></label>`;
/* ---------- selector de cliente con búsqueda y alta rápida (pedidos) ---------- */
const cliLabels=()=>{const cnt={};S.clientes.forEach(c=>{const k=(c.nombre||'').trim().toLowerCase();cnt[k]=(cnt[k]||0)+1});
  return S.clientes.map(c=>{const k=(c.nombre||'').trim().toLowerCase();return {id:c.id,label:cnt[k]>1&&c.ciudad?`${c.nombre} · ${c.ciudad}`:c.nombre,c}}).sort((a,b)=>(a.label||'').localeCompare(b.label||'','es'))};
const cliPicker=(cid)=>{const L=cliLabels(),cur=L.find(x=>x.id===cid),nuevo=!S.clientes.length;
  return `<div class="cli-pick"><label class="fld"><span>Cliente</span><input id="f_cliBuscar" name="cliBuscar" type="search" list="cli_opts" autocomplete="off" placeholder="Escriba para buscar un cliente guardado…" value="${esc(cur?cur.label:'')}"></label>
  <datalist id="cli_opts">${L.map(x=>`<option value="${esc(x.label)}">${esc([x.c.ciudad,x.c.tel].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
  <input type="hidden" id="f_clienteId" name="clienteId" value="${esc(cid||'')}"><input type="hidden" name="nuevoCli" id="f_nuevoCli" value="${nuevo?'1':''}">
  <div class="cli-hint mut small" id="cliHint">${nuevo?'Aún no hay clientes guardados: complete los datos del cliente nuevo.':(cur?'Cliente seleccionado.':'Seleccione uno de la lista o cree un cliente nuevo.')}</div>
  <button type="button" class="btn ghost" data-act="cli-nuevo" id="cliToggle">${nuevo?'':'+ Cliente nuevo'}</button>
  <div id="cliNuevo" class="cli-new card" ${nuevo?'':'hidden'}><div class="frow">${fld('Nombre o razón social del cliente nuevo','nuevoNombre','','text')}${sel('Tipo','nuevoTipo',['Restaurante o bar','Tienda o licorera','Distribuidor','Evento','Consumidor final'],'Restaurante o bar')}</div><div class="frow">${fld('Teléfono o WhatsApp','nuevoTel','')}${fld('Ciudad','nuevoCiudad','')}</div><div class="frow">${fld('Dirección','nuevoDir','')}${fld('Persona de contacto','nuevoContacto','')}</div><div class="mut small">Se guarda en el CRM al registrar el pedido.</div></div></div>`};
function cliSync(f){const inp=f.querySelector('#f_cliBuscar'),hid=f.querySelector('#f_clienteId'),hint=f.querySelector('#cliHint');if(!inp||!hid)return;
  const q=inp.value.trim().toLowerCase(),m=cliLabels().find(x=>x.label.toLowerCase()===q);
  hid.value=m?m.id:'';
  if(m){hint.textContent='Cliente seleccionado.';const c=D.C[m.id],pl=f.querySelector('[name=plazo]'),co=f.querySelector('[name=condicion]');if(c&&c.plazo&&pl&&co&&co.value==='Crédito')pl.value=c.plazo;return}
  const n=cliLabels().filter(x=>q&&x.label.toLowerCase().includes(q)).length;
  hint.textContent=!q?'Seleccione uno de la lista o cree un cliente nuevo.':(n?`${n} coincidencia(s): elija una de la lista.`:'No existe ese cliente. Pulse «+ Cliente nuevo» para crearlo.')}
function cliToggle(f,open){const box=f.querySelector('#cliNuevo'),flag=f.querySelector('#f_nuevoCli'),btn=f.querySelector('#cliToggle'),inp=f.querySelector('#f_cliBuscar');
  const abrir=open===undefined?box.hidden:open;box.hidden=!abrir;flag.value=abrir?'1':'';btn.textContent=abrir?'Usar un cliente guardado':'+ Cliente nuevo';
  if(abrir){const nn=f.querySelector('#f_nuevoNombre');if(nn&&!nn.value)nn.value=inp.value.trim();if(nn)nn.focus();f.querySelector('#f_clienteId').value=''}else{cliSync(f)}}
const area=(l,n,v='')=>`<label class="fld"><span>${l}</span><textarea id="f_${n}" name="${n}">${esc(v)}</textarea></label>`;
function itemRow(i,kind){
  const prods=[['','Seleccione producto']].concat(S.productos.map(p=>[p.id,p.nombre]));
  const hint=kind==='venta'&&i.pid?`Disponible: ${nf(D.stock[i.pid]||0)} und.`:'';
  const comp=kind==='compra'?`<select name="comp" class="inp" style="width:100%" aria-label="Concepto">${COMPS.map(c=>`<option ${c===(i.comp||'Cerveza')?'selected':''}>${c}</option>`).join('')}</select>`:'';
  return `<div class="irow${kind==='compra'?' c':''}">${comp}<select name="pid" class="inp" style="width:100%">${prods.map(([a,b])=>`<option value="${esc(a)}" ${a===i.pid?'selected':''}>${esc(b)}</option>`).join('')}</select><input name="cant" class="inp" style="width:100%" type="number" min="0" step="1" placeholder="Cant." value="${i.cant||''}"><input name="val" class="inp" style="width:100%" type="number" min="0" step="any" placeholder="${kind==='venta'?'Precio und.':'Costo und.'}" value="${i.val||''}"><span class="ln num">${fmt((+i.cant||0)*(+i.val||0))}</span><button type="button" class="btn sm" data-act="rmrow" aria-label="Quitar ítem">✕</button>${hint?`<span class="hint">${hint}</span>`:''}</div>`;
}
const itemsEditor=(items,kind)=>`<div><div class="mut small" style="margin-bottom:6px">${kind==='compra'?'Conceptos de la orden (cerveza, etiqueta, caja six pack)':'Productos'}</div><div id="items" data-kind="${kind}">${(items&&items.length?items:[{}]).map(i=>itemRow(i,kind)).join('')}</div><button type="button" class="btn sm" data-act="addrow">${kind==='compra'?'Agregar concepto':'Agregar producto'}</button></div><div class="tot"><span>Total</span><span id="tot" class="num">${fmt(tot(items))}</span></div>`;
function modal(title,body,id,kind,del){
  const m=$('#modal');
  m.innerHTML=`<form class="sheet" id="mform" data-kind="${kind}" data-id="${id||''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="btn sm" data-act="close" aria-label="Cerrar">✕</button></header><div class="bd">${body}</div><footer><span>${id&&del!==false?`<button type="button" class="btn danger" data-act="del" data-kind="${kind}" data-id="${id}">Eliminar</button>`:''}</span><span style="display:flex;gap:8px"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri" type="submit">Guardar</button></span></footer></form>`;
  m.hidden=false;const f=m.querySelector('input,select');if(f)f.focus();
}
function closeModal(){const m=$('#modal');m.hidden=true;m.innerHTML=''}
const find=(col,id)=>S[col].find(x=>x.id===id)||null;
function openForm(kind,id,preset){
  const t=todayStr();
  if(!isAdmin()&&['producto','compra','mov','ajuste','activo'].includes(kind)){toast('Solo el administrador puede hacer este cambio.');return}
  if(kind==='producto'){const p=find('productos',id)||{etiqueta:'otra',estilo:'American Amber Lager',ml:330};
    modal(id?'Editar producto':'Nuevo producto',`${fld('Nombre','nombre',p.nombre||'','text','required')}<div class="frow">${fld('Estilo','estilo',p.estilo)}${sel('Etiqueta','etiqueta',[['ambar','Etiqueta ámbar'],['roja','Etiqueta roja'],['otra','Sin imagen de etiqueta']],p.etiqueta)}</div><div class="fld"><span>Imagen de la etiqueta (JPG o PNG); si sube una, reemplaza a la anterior</span><div class="labprev"><input type="file" id="labfile" accept="image/*"><span id="labprev">${p.etiquetaImg?`<img src="${p.etiquetaImg}" alt="Etiqueta cargada">`:''}</span>${p.etiquetaImg?'<button type="button" class="btn sm" data-act="rmlab">Quitar imagen</button>':''}</div><input type="hidden" name="etiquetaImg" id="f_etiquetaImg" value="${esc(p.etiquetaImg||'')}"></div><div class="frow">${fld('Grado alcohólico (% vol.)','abv',p.abv||'','number','step="any" min="0"')}${fld('IBU','ibu',p.ibu||'','number','min="0"')}${fld('Contenido (ml)','ml',p.ml||'','number','min="0"')}${fld('Temperatura de servicio (°C)','temp',p.temp||'','number')}</div>${fld('Ingredientes','ingredientes',p.ingredientes||'')}<div class="frow">${fld('Costo de referencia por unidad','costo',p.costo||'','number','min="0" step="any"')}${fld('Precio de venta por unidad','precio',p.precio||'','number','min="0" step="any"')}${fld('Stock mínimo (unidades)','stockMin',p.stockMin||'','number','min="0"')}${fld('Botellas por six pack','porPack',p.porPack||6,'number','min="1" step="1"')}</div>${area('Notas de producto','desc',p.desc||'')}<div class="mut small">El costo real suma el promedio de la cerveza, la etiqueta y la caja six pack (dividida entre las botellas por six pack) de las órdenes de compra recibidas; el costo de referencia se usa mientras no haya compras.</div>`,id,kind);}
  else if(kind==='cliente'){const c=find('clientes',id)||{estado:'Prospecto',tipo:'Restaurante o bar'};
    const vs=id?D.vOk.filter(v=>v.clienteId===id).sort((a,b)=>a.fecha<b.fecha?1:-1).slice(0,6):[];
    modal(id?'Editar cliente':'Nuevo cliente',`${fld('Nombre o razón social','nombre',c.nombre||'','text','required')}<div class="frow">${sel('Tipo','tipo',['Restaurante o bar','Tienda o licorera','Distribuidor','Evento','Consumidor final'],c.tipo)}${sel('Estado','estado',['Prospecto','Activo','Inactivo'],c.estado)}</div><div class="frow">${fld('Persona de contacto','contacto',c.contacto||'')}${fld('Teléfono o WhatsApp','tel',c.tel||'')}${fld('Correo electrónico','email',c.email||'','email')}</div><div class="frow">${fld('Ciudad','ciudad',c.ciudad||'')}${fld('Dirección','direccion',c.direccion||'')}</div><div class="frow">${fld('Cupo de crédito (COP)','cupo',c.cupo||'','number','min="0"')}${fld('Plazo habitual de pago (días)','plazo',c.plazo||'','number','min="0"')}</div>${area('Notas','notas',c.notas||'')}${vs.length?`<div><div class="mut small" style="margin-bottom:6px">Últimos pedidos</div>${tableWrap(`<table><tbody>${vs.map(v=>`<tr><td>VT-${pad(v.n)}</td><td>${fdate(v.fecha)}</td><td class="small">${itemsTxt(v.items)}</td><td>${estPill(v.estado)}</td><td class="r">${fmt(v.total)}</td></tr>`).join('')}</tbody></table>`)}</div>`:''}`,id,kind);}
  else if(kind==='venta'){const v=find('ventas',id)||(preset==='credito'?{fecha:t,estado:'Pendiente',condicion:'Crédito',plazo:30,medio:'Transferencia',items:[]}:{fecha:t,estado:'Pagado',medio:'Efectivo',condicion:'Contado',items:[]});
    if(!S.productos.length){toast('Cree primero un producto en el módulo Productos.');return}
    modal(id?'Venta VT-'+pad(v.n):'Nueva venta',`<div class="frow">${sel('Cliente','clienteId',[['','Cliente ocasional']].concat(S.clientes.map(c=>[c.id,c.nombre])),v.clienteId||'')}${fld('Fecha del pedido','fecha',v.fecha,'date','required')}${sel('Vendedor','vendedor',[['','Sin asignar']].concat(VENDEDORES),v.vendedor||'')}</div>${itemsEditor(v.items,'venta')}${area('Nota del pedido','nota',v.nota||'')}<div class="mut small">Al guardar, las unidades salen del inventario. La forma de pago (efectivo o crédito) se define en la solicitud de pedido y los cobros se registran en Cartera. Si necesita cambiarla, elimine la venta: la solicitud vuelve a «Solicitado».</div>`,id,kind);}
  else if(kind==='compra'){const o=find('compras',id)||{fecha:t,estado:'Pedida',pago:'Pendiente',medio:'Transferencia',items:[]};
    if(!S.productos.length){toast('Cree primero un producto en el módulo Productos.');return}
    modal(id?'Orden OC-'+pad(o.n):'Nueva orden de compra',`<div class="frow">${fld('Proveedor','proveedor',o.proveedor||'','text','required')}${fld('Fecha de la orden','fecha',o.fecha,'date','required')}</div><div class="frow">${sel('Estado de la orden','estado',['Pedida','Recibida','Anulada'],o.estado)}${fld('Fecha de recepción','fechaRecibo',o.fechaRecibo||'','date')}</div><div class="frow">${sel('Estado del pago','pago',['Pendiente','Pagado'],o.pago)}${sel('Medio de pago','medio',MEDIOS,o.medio)}${fld('Fecha de pago','fechaPago',o.fechaPago||'','date')}</div>${itemsEditor(o.items,'compra')}${area('Nota','nota',o.nota||'')}<div class="mut small">Cuando el estado es Recibida, las botellas de las líneas de <b>Cerveza</b> entran al inventario; las líneas de <b>Etiqueta</b> y <b>Caja six pack</b> se suman al costo de cada producto (la caja se reparte entre las botellas del six pack). Cuando el pago es Pagado, el egreso sale de caja con el medio elegido.</div>`,id,kind);}
  else if(kind==='mov'){const x=find('movcaja',id)||(preset==='aporte'?{tipo:'Ingreso',cat:'Aporte de socios',concepto:'Aporte inicial de socios',fecha:START+'-01',medio:'Transferencia'}:preset==='inversion'?{tipo:'Egreso',cat:'Inversión inicial',fecha:t,medio:'Transferencia'}:{tipo:'Egreso',cat:'Otros egresos',fecha:t,medio:'Efectivo'});
    modal(id?'Editar movimiento':'Movimiento de caja',`<div class="frow">${sel('Tipo','tipo',['Ingreso','Egreso'],x.tipo)}${fld('Fecha','fecha',x.fecha,'date','required')}</div><div class="frow">${sel('Categoría','cat',[...CAT_ING,...CAT_EGR],x.cat)}${sel('Medio de pago','medio',MEDIOS,x.medio)}</div>${fld('Concepto','concepto',x.concepto||'','text','required')}${fld('Monto','monto',x.monto||'','number','required min="0" step="any"')}<div class="mut small">Use este formulario para aportes, inversión de arranque y gastos fijos. Las ventas y compras ya llegan solas desde sus módulos.</div>`,id,kind);}
  else if(kind==='activo'){const a=find('activos',id)||{categoria:CAT_ACT[0],ubic:UBICS[0],estado:'Operativo',cant:1,fechaAdq:''};
    modal(id?'Editar activo':'Nuevo activo',`${fld('Nombre del equipo','nombre',a.nombre||'','text','required placeholder="Ej.: Fermentador cónico, olla de cocción, enfriador de placas"')}<div class="frow">${sel('Categoría','categoria',CAT_ACT,a.categoria)}${sel('Estado','estado',EST_ACT,a.estado)}</div><div class="frow">${sel('Ubicación','ubic',UBICS,a.ubic)}${fld('Si es otro lugar, indique cuál','otroLugar',a.otroLugar||'')}</div><div class="frow">${fld('Marca','marca',a.marca||'')}${fld('Modelo','modelo',a.modelo||'')}${fld('Serial o código interno','serial',a.serial||'')}</div><div class="frow">${fld('Capacidad o especificación','capacidad',a.capacidad||'','text','placeholder="Ej.: 500 L, 380 V"')}${fld('Cantidad','cant',a.cant==null?1:a.cant,'number','min="0" step="1"')}</div><div class="frow">${fld('Valor de adquisición por unidad (COP)','valor',a.valor||'','number','min="0" step="any"')}${fld('Fecha de adquisición','fechaAdq',a.fechaAdq||'','date')}${fld('Responsable','responsable',a.responsable||'')}</div>${area('Notas (mantenimientos, garantía, proveedor)','nota',a.nota||'')}${id&&(a.historial||[]).length?`<div class="mut small">Traslados: ${a.historial.map(x=>fdate(x.fecha)+' de '+esc(x.de)+' a '+esc(x.a)).join(' · ')}</div>`:''}<div class="mut small">Si cambia la ubicación, el traslado queda registrado con la fecha de hoy.</div>`,id,kind);}
  else if(kind==='cotizacion'){const c=find('cotizaciones',id)||{fecha:t,vigencia:15,estado:'Borrador',items:[]};
    if(!S.productos.length){toast('Cree primero un producto en el módulo Productos.');return}
    modal(id?'Cotización CT-'+pad(c.n):'Nueva cotización',`<div class="frow">${sel('Cliente','clienteId',[['','Prospecto (aún no está en el CRM)']].concat(S.clientes.map(x=>[x.id,x.nombre])),c.clienteId||'')}${fld('Nombre del prospecto','prospecto',c.prospecto||'')}</div><div class="frow">${fld('Fecha','fecha',c.fecha,'date','required')}${fld('Vigencia (días)','vigencia',c.vigencia||15,'number','min="1"')}${sel('Vendedor','vendedor',[['','Sin asignar']].concat(VENDEDORES),c.vendedor||'')}${sel('Estado','estado',['Borrador','Enviada','Aceptada','Rechazada'],c.estado)}</div>${itemsEditor(c.items,'venta')}${area('Condiciones y notas','nota',c.nota||'')}<div class="mut small">Una cotización aceptada se convierte en pedido desde el listado: se abre el pedido con sus datos para elegir la forma de pago y la fecha, y al guardarlo se genera la venta.</div>`,id,kind);}
  else if(kind==='pedido'){const cot=preset&&preset.startsWith('cot:')?find('cotizaciones',preset.slice(4)):null;
    const q=find('pedidos',id)||(cot?{fecha:t,condicion:'Contado',clienteId:cot.clienteId||'',vendedor:cot.vendedor||'',items:cot.items,nota:'Cotización CT-'+pad(cot.n)+(cot.prospecto&&!cot.clienteId?' · '+cot.prospecto:'')}:preset&&preset.startsWith('cli:')?{fecha:t,condicion:'Contado',clienteId:preset.slice(4),items:[]}:preset==='credito'?{fecha:t,condicion:'Crédito',plazo:30,items:[]}:{fecha:t,condicion:'Contado',items:[]});
    if(!S.productos.length){toast('Cree primero un producto en el módulo Productos.');return}
    modal(id?'Pedido PD-'+pad(q.n):'Nuevo pedido',`<div class="frow">${sel('Vendedor','vendedor',vendOpts(q.vendedor),q.vendedor||(USER&&USER.vendedor)||VENDEDORES[0])}${cliPicker(q.clienteId||'')}</div><div class="frow">${fld('Fecha de la venta','fecha',q.fecha||t,'date','required')}${fld('Fecha de entrega deseada','fechaEntrega',q.fechaEntrega||'','date')}${sel('Forma de pago','condicion',[['Contado','Efectivo'],['Crédito','Crédito']],q.condicion||'Contado')}${fld('Plazo en días (solo crédito)','plazo',q.plazo||'','number','min="0"')}</div>${itemsEditor(q.items,'venta')}${area('Observaciones','nota',q.nota||'')}${cot?`<input type="hidden" name="cotId" value="${cot.id}">`:''}<div class="mut small">Al guardar se crea la venta y se descuenta inventario. Si es en <b>efectivo</b>, el ingreso entra al Flujo de caja; si es a <b>crédito</b>, queda en Cartera con su vencimiento.${id?' Al eliminar el pedido también se elimina su venta.':''}</div>`,id,kind);}
  else if(kind==='ajuste'){const a=find('ajustes',id)||{fecha:t,cant:''};
    modal(id?'Editar ajuste':'Ajuste o merma de inventario',`${sel('Producto','pid',[['','Seleccione producto']].concat(S.productos.map(p=>[p.id,p.nombre])),a.pid||'')}<div class="frow">${fld('Fecha','fecha',a.fecha,'date','required')}${fld('Cantidad (negativa para bajas)','cant',a.cant,'number','required step="1"')}</div>${fld('Motivo','motivo',a.motivo||'','text','placeholder="Botellas rotas, muestras, conteo físico"')}`,id,kind);}
}
function openAbono(id){
  const v=find('ventas',id);if(!v)return;const cn=(D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional';
  modal('Pago de VT-'+pad(v.n),`<dl class="kv"><dt>Cliente</dt><dd>${esc(cn)}</dd><dt>Total del pedido</dt><dd>${fmt(v.total)}</dd><dt>Abonado</dt><dd>${fmt(v.abonado||0)}</dd><dt>Saldo pendiente</dt><dd><b>${fmt(v.saldo)}</b></dd><dt>Vencimiento</dt><dd>${fdate(v.vence)}</dd></dl>${v.saldo>0?`<div class="frow">${sel('Tipo de pago','tipo',[['Saldo','Saldo total'],['Abono','Abono (pago parcial)']],'Saldo')}${fld('Monto','monto',Math.round(v.saldo),'number','required min="1" step="any" readonly data-saldo="'+Math.round(v.saldo)+'"')}</div><div class="frow">${fld('Fecha del pago','fecha',todayStr(),'date','required')}${sel('Medio de pago','medio',MEDIOS,v.medio)}</div>`:'<div class="mut small">Este pedido está pagado en su totalidad.</div>'}${(v.abonos||[]).length?`<div><div class="mut small" style="margin-bottom:6px">Pagos registrados</div>${tableWrap(`<table><tbody>${v.abonos.map(a=>`<tr><td>${fdate(a.fecha)}</td><td>${esc(a.tipo||'Abono')}</td><td>${esc(a.medio)}</td><td class="r">${fmt(a.monto)}</td><td class="r"><button type="button" class="link" data-act="rmabono" data-id="${v.id}" data-aid="${a.id}">Quitar</button></td></tr>`).join('')}</tbody></table>`)}</div>`:''}<div class="mut small">El pago entra al Flujo de caja con el medio elegido. Si cubre el saldo, el pedido queda pagado.</div>`,id,'abono',false);
}
function openCliente(id){
  const c=find('clientes',id);if(!c)return;
  const vs=S.ventas.filter(v=>v.clienteId===id&&v.estado!=='Anulado').sort((a,b)=>a.fecha<b.fecha?1:a.fecha>b.fecha?-1:b.n-a.n);
  const total=vs.reduce((a,v)=>a+v.total,0),saldo=vs.reduce((a,v)=>a+(v.saldo||0),0);
  const prod={};vs.forEach(v=>(v.items||[]).forEach(i=>{prod[i.pid]=(prod[i.pid]||0)+(+i.cant||0)}));
  const top=Object.entries(prod).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([pid,q])=>nf(q)+'× '+esc(pname(pid))).join(' · ');
  const pend=0;
  const cu=+c.cupo||0;
  const hist=vs.length?tableWrap(`<table><thead><tr><th>N.º</th><th>Fecha</th><th>Productos</th><th>Forma de pago</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>${vs.map(v=>`<tr><td><b>VT-${pad(v.n)}</b>${v.vendedor?`<div class="mut small">${esc(v.vendedor)}</div>`:''}</td><td>${fdate(v.fecha)}</td><td class="small">${itemsTxt(v.items)}</td><td>${v.condicion==='Crédito'?'Crédito':esc(v.medio||'Efectivo')}</td><td>${v.estado==='Pagado'?pill('Pagado','ok'):pill('Saldo '+fmt(v.saldo),v.vence<todayStr()?'bad':'warn')}</td><td class="r">${fmt(v.total)}</td></tr>`).join('')}</tbody></table>`):emptyHtml('Sin compras registradas','Cuando se apruebe una solicitud de pedido de este cliente, su historial aparece aquí.');
  const m=$('#modal');
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.nombre)}"><header><h2>${esc(c.nombre)}</h2><button type="button" class="btn sm" data-act="close" aria-label="Cerrar">✕</button></header><div class="bd">
  <div class="chips">${pill(c.estado||'Prospecto',c.estado==='Activo'?'ok':c.estado==='Inactivo'?'neu':'warn')}<span class="chip">${esc(c.tipo||'')}</span>${c.ciudad?`<span class="chip">${esc(c.ciudad)}</span>`:''}${pend?`<span class="chip">${pend} solicitud${pend===1?'':'es'} por aprobar</span>`:''}</div>
  <dl class="kv"><dt>Contacto</dt><dd>${esc(c.contacto||'—')}</dd><dt>Teléfono</dt><dd>${esc(c.tel||'—')}</dd><dt>Correo</dt><dd>${esc(c.email||'—')}</dd><dt>Dirección</dt><dd>${esc(c.direccion||'—')}</dd><dt>Cupo de crédito</dt><dd>${cu?fmt(cu)+(saldo>cu?' · '+pill('Excedido','bad'):' · disponible '+fmt(cu-saldo)):'Sin cupo asignado'}</dd></dl>
  <div class="grid g4"><div class="card kpi sm"><span class="lab">Total comprado</span><span class="val num">${fmt(total)}</span><span class="note">${vs.length} pedido${vs.length===1?'':'s'}</span></div><div class="card kpi sm"><span class="lab">Ticket promedio</span><span class="val num">${vs.length?fmt(total/vs.length):'—'}</span><span class="note">${vs.length?'Último: '+fdate(vs[0].fecha):'Sin compras'}</span></div><div class="card kpi sm"><span class="lab">Cartera</span><span class="val num ${saldo?'down':''}">${fmt(saldo)}</span><span class="note">Saldo por cobrar</span></div><div class="card kpi sm"><span class="lab">Más comprado</span><span class="val" style="font-size:15px;line-height:1.3">${top||'—'}</span><span class="note">Por unidades</span></div></div>
  <div><h2 style="margin:0 0 8px">Historial de compras</h2>${hist}</div>${c.notas?`<p class="mut" style="margin:0">${esc(c.notas)}</p>`:''}</div>
  <footer><span></span><span style="display:flex;gap:8px"><button class="btn" data-act="close">Cerrar</button><button class="btn" data-act="edit" data-kind="cliente" data-id="${c.id}">Editar cliente</button><button class="btn pri" data-act="new" data-kind="pedido" data-preset="cli:${c.id}">Nueva solicitud</button></span></footer></div>`;
  m.hidden=false;
}
function openProd(id){
  const p=find('productos',id);if(!p)return;const cpv=D.cp(p.id),mg=p.precio>0&&cpv?((p.precio-cpv)/p.precio*100):null,img=prodImg(p);
  const m=$('#modal');
  m.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(p.nombre)}"><header><h2>${esc(p.nombre)}</h2><button type="button" class="btn sm" data-act="close" aria-label="Cerrar">✕</button></header><div class="bd"><div class="det"><div class="lab">${img?`<img src="${img}" alt="Etiqueta de ${esc(p.nombre)}">${p.etiqueta==='ambar'?`<img class="bt" src="${IMG.amber}" alt="Botella con la etiqueta ámbar">`:''}`:'<span class="mut" style="color:var(--on-ink-mute)">Sin imagen de etiqueta</span>'}</div><dl class="kv"><dt>Estilo</dt><dd>${esc(p.estilo||'—')}</dd><dt>Grado alcohólico</dt><dd>${p.abv?nf(p.abv)+'% vol.':'—'}</dd><dt>IBU</dt><dd>${p.ibu?nf(p.ibu):'—'}</dd><dt>Contenido</dt><dd>${p.ml?nf(p.ml)+' ml':'—'}</dd><dt>Servir a</dt><dd>${p.temp?nf(p.temp)+' °C':'—'}</dd><dt>Ingredientes</dt><dd>${esc(p.ingredientes||'—')}</dd>${(()=>{const c=D.comps(p.id);return c.total>0?`<dt>Cerveza</dt><dd>${c['Cerveza']?fmt(c['Cerveza']):'Sin compras'}</dd><dt>Etiqueta</dt><dd>${c['Etiqueta']?fmt(c['Etiqueta']):'Sin compras'}</dd><dt>Caja six pack (÷ ${c.pp})</dt><dd>${c['Caja six pack']?fmt(c['Caja six pack']):'Sin compras'}</dd>${c['Otro costo']?`<dt>Otros costos</dt><dd>${fmt(c['Otro costo'])}</dd>`:''}`:''})()}<dt>Costo por unidad</dt><dd>${cpv?fmt(cpv):'Sin definir'}</dd><dt>Precio de venta</dt><dd>${p.precio?fmt(p.precio):'Sin definir'}</dd><dt>Utilidad por unidad</dt><dd>${p.precio&&cpv?fmt(p.precio-cpv):'—'}</dd><dt>Margen</dt><dd>${mg===null?'—':mg.toFixed(1)+'%'}</dd><dt>Stock actual</dt><dd>${nf(D.stock[p.id]||0)} und.</dd></dl></div>${p.desc?`<p style="margin:0">${esc(p.desc)}</p>`:''}${!cpv||!p.precio?`<div class="warnbox">Complete el costo y el precio de venta para calcular márgenes y utilidad.</div>`:''}</div><footer><span></span><span style="display:flex;gap:8px"><button class="btn" data-act="close">Cerrar</button><button class="btn pri" data-act="edit" data-kind="producto" data-id="${p.id}">Editar producto</button></span></footer></div>`;
  m.hidden=false;
}
function readLabel(file,cb){
  const fr=new FileReader();
  fr.onerror=()=>cb(null);
  fr.onload=()=>{const im=new Image();im.onerror=()=>cb(null);
    im.onload=()=>{const enc=(mx,q)=>{const s=Math.min(1,mx/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q)};
      let u=enc(900,.85);if(u.length>600000)u=enc(640,.75);cb(u)};
    im.src=fr.result};
  fr.readAsDataURL(file);
}
function collectItems(form){return [...form.querySelectorAll('.irow')].map(r=>({pid:r.querySelector('[name=pid]').value,cant:+r.querySelector('[name=cant]').value||0,val:+r.querySelector('[name=val]').value||0,...(r.querySelector('[name=comp]')?{comp:r.querySelector('[name=comp]').value}:{})})).filter(i=>i.pid&&i.cant>0)}
function refreshTotals(form){
  let t=0;form.querySelectorAll('.irow').forEach(r=>{const c=+r.querySelector('[name=cant]').value||0,v=+r.querySelector('[name=val]').value||0;t+=c*v;r.querySelector('.ln').textContent=fmt(c*v)});
  const e=form.querySelector('#tot');if(e)e.textContent=fmt(t);
}
async function onSubmit(form){
  const kind=form.dataset.kind,id=form.dataset.id||uid(),fd=new FormData(form),g=n=>(fd.get(n)||'').toString(),gn=n=>Number(g(n))||0;
  if(kind==='usuario'){const b={nombre:g('nombre').trim(),usuario:g('usuario').trim(),rol:g('rol'),vendedor:g('vendedor').trim(),clave:g('clave'),activo:g('activo')!=='no'};
    if(!form.dataset.id&&b.clave.length<8)return toast('La contraseña debe tener al menos 8 caracteres.');
    try{await api(form.dataset.id?'usuarios/'+form.dataset.id:'usuarios',form.dataset.id?'PUT':'POST',b);closeModal();toast('Usuario guardado.');await loadUsers();await syncNow()}catch(e){toast(e.msg||'No se pudo guardar el usuario.')}return}
  if(kind==='clave'){if(g('nueva')!==g('repetir'))return toast('Las contraseñas nuevas no coinciden.');
    try{await api('clave','POST',{actual:g('actual'),nueva:g('nueva')});closeModal();toast('Contraseña actualizada.')}catch(e){toast(e.msg||'No se pudo cambiar la contraseña.')}return}
  if(kind==='abono'){const v=find('ventas',form.dataset.id);if(!v)return;const tipo=g('tipo')||'Abono',monto=tipo==='Saldo'?Math.round(v.saldo):gn('monto'),fecha=g('fecha');if(monto<=0)return toast('Indique un monto mayor que cero.');if(monto>v.saldo+0.5)return toast('El monto supera el saldo pendiente ('+fmt(v.saldo)+').');
    const abonos=[...(v.abonos||[]),{id:uid(),fecha,monto,medio:g('medio'),tipo}];const done=abonos.reduce((a,x)=>a+x.monto,0)>=(+v.total||0)-0.5;const upd={abonos};if(done){upd.estado='Pagado';upd.fechaPago=fecha}
    if(await dbUpd('ventas',v.id,upd)){closeModal();toast(done?'Pago registrado: el pedido quedó pagado.':'Abono registrado en el Flujo de caja.')}return}
  const colOf={producto:'productos',cliente:'clientes',venta:'ventas',compra:'compras',mov:'movcaja',ajuste:'ajustes',activo:'activos',cotizacion:'cotizaciones',pedido:'pedidos'}[kind];
  const old=find(colOf,form.dataset.id)||{};const {id:_a,total:_b,...rest}=old;let d;
  if(kind==='producto'){d={nombre:g('nombre').trim(),estilo:g('estilo'),etiqueta:g('etiqueta'),abv:gn('abv'),ibu:gn('ibu'),ml:gn('ml'),temp:gn('temp'),ingredientes:g('ingredientes'),desc:g('desc'),costo:gn('costo'),precio:gn('precio'),stockMin:gn('stockMin'),porPack:gn('porPack')||6,etiquetaImg:g('etiquetaImg')};if(!d.nombre)return toast('Ingrese el nombre del producto.')}
  if(kind==='cliente'){d={nombre:g('nombre').trim(),tipo:g('tipo'),estado:g('estado'),contacto:g('contacto'),tel:g('tel'),email:g('email'),ciudad:g('ciudad'),direccion:g('direccion'),cupo:gn('cupo'),plazo:gn('plazo'),notas:g('notas')};if(!d.nombre)return toast('Ingrese el nombre del cliente.');if(!old.fechaAlta)d.fechaAlta=todayStr()}
  if(kind==='venta'){const items=collectItems(form);if(!items.length)return toast('Agregue al menos un producto con cantidad.');d={clienteId:g('clienteId'),vendedor:g('vendedor'),fecha:g('fecha'),items,nota:g('nota'),n:old.n||nextN(S.ventas)};if(!old.estado){d.estado='Pendiente';d.medio='Transferencia';d.fechaPago='';d.condicion='Contado';d.plazo=0}}
  if(kind==='compra'){const items=collectItems(form);if(!items.length)return toast('Agregue al menos un concepto con cantidad.');d={proveedor:g('proveedor').trim(),fecha:g('fecha'),estado:g('estado'),fechaRecibo:g('fechaRecibo'),pago:g('pago'),medio:g('medio'),fechaPago:g('fechaPago'),items,nota:g('nota'),n:old.n||nextN(S.compras)};if(d.estado==='Recibida'&&!d.fechaRecibo)d.fechaRecibo=d.fecha;if(d.pago==='Pagado'&&!d.fechaPago)d.fechaPago=d.fecha;if(d.pago!=='Pagado')d.fechaPago=''}
  if(kind==='mov'){d={tipo:g('tipo'),fecha:g('fecha'),cat:g('cat'),medio:g('medio'),concepto:g('concepto').trim(),monto:gn('monto')};if(!d.concepto||d.monto<=0)return toast('Indique el concepto y un monto mayor que cero.')}
  if(kind==='activo'){d={nombre:g('nombre').trim(),categoria:g('categoria'),estado:g('estado'),ubic:g('ubic'),otroLugar:g('ubic')==='Otro lugar'?g('otroLugar').trim():'',marca:g('marca'),modelo:g('modelo'),serial:g('serial'),capacidad:g('capacidad'),cant:gn('cant'),valor:gn('valor'),fechaAdq:g('fechaAdq'),responsable:g('responsable'),nota:g('nota')};if(!d.nombre)return toast('Ingrese el nombre del equipo.');if(d.cant<=0)return toast('Indique una cantidad mayor que cero.');
    const hist=old.historial||[];const prev=old.id||form.dataset.id?locName(old):'';if(form.dataset.id&&old.ubic&&locName(d)!==prev)hist.push({fecha:todayStr(),de:prev,a:locName(d)});d.historial=hist}
  if(kind==='cotizacion'){const items=collectItems(form);if(!items.length)return toast('Agregue al menos un producto con cantidad.');d={clienteId:g('clienteId'),prospecto:g('prospecto').trim(),fecha:g('fecha'),vigencia:gn('vigencia')||15,vendedor:g('vendedor'),estado:g('estado'),items,nota:g('nota'),n:old.n||nextN(S.cotizaciones),ventaId:old.ventaId||''};if(!d.clienteId&&!d.prospecto)return toast('Seleccione un cliente o escriba el nombre del prospecto.')}
  if(kind==='pedido'){const items=collectItems(form);if(!items.length)return toast('Agregue al menos un producto con cantidad.');
    d={vendedor:g('vendedor'),clienteId:g('clienteId'),fecha:g('fecha')||old.fecha||todayStr(),fechaEntrega:g('fechaEntrega'),condicion:g('condicion'),plazo:g('condicion')==='Crédito'?(gn('plazo')||30):0,items,nota:g('nota'),n:old.n||nextN(S.pedidos)};
    if(g('nuevoCli')==='1'){const nn=g('nuevoNombre').trim();if(!nn)return toast('Escriba el nombre del cliente nuevo.');
      const dup=S.clientes.find(c=>(c.nombre||'').trim().toLowerCase()===nn.toLowerCase());
      if(dup)d.clienteId=dup.id;
      else{const nid=uid();if(!await dbSet('clientes',nid,{nombre:nn,tipo:g('nuevoTipo'),estado:'Activo',contacto:g('nuevoContacto').trim(),tel:g('nuevoTel').trim(),email:'',ciudad:g('nuevoCiudad').trim(),direccion:g('nuevoDir').trim(),cupo:0,plazo:0,notas:'Creado desde Solicitud de pedidos',fechaAlta:todayStr()}))return;d.clienteId=nid}}
    if(!d.clienteId)return toast('Seleccione un cliente guardado o cree uno nuevo.');
    const cred=d.condicion==='Crédito',lv=old.ventaId&&find('ventas',old.ventaId);
    const need={};items.forEach(i=>{need[i.pid]=(need[i.pid]||0)+i.cant});
    const prev={};if(lv)(lv.items||[]).forEach(x=>{prev[x.pid]=(prev[x.pid]||0)+(+x.cant||0)});
    const short=Object.keys(need).filter(pid=>need[pid]>(D.stock[pid]||0)+(prev[pid]||0));
    if(short.length)return toast('Stock insuficiente: '+short.map(pid=>pname(pid)+' (disponible '+nf((D.stock[pid]||0)+(prev[pid]||0))+', pidió '+nf(need[pid])+')').join('; ')+'. Solo se vende lo que está en inventario.');
    const warn='';
    if(lv){const credOld=lv.condicion==='Crédito';
      if(cred!==credOld&&(lv.abonos||[]).length)return toast('Este pedido tiene pagos en Cartera. Quítelos antes de cambiar la forma de pago.');
      const upd={fecha:d.fecha,clienteId:d.clienteId,vendedor:d.vendedor,items,condicion:d.condicion,plazo:d.plazo};
      if(!cred){upd.estado='Pagado';upd.medio='Efectivo';upd.fechaPago=d.fecha}
      else if(!credOld){upd.estado='Pendiente';upd.medio='Transferencia';upd.fechaPago=''}
      else{const ab=(lv.abonos||[]).reduce((s,x)=>s+(+x.monto||0),0),paid=ab>=tot(items)-0.5;upd.estado=paid?'Pagado':'Pendiente';upd.fechaPago=paid?(lv.fechaPago||todayStr()):''}
      if(await dbSet('pedidos',id,{...rest,...d})&&await dbUpd('ventas',lv.id,upd)){closeModal();toast('Pedido y venta actualizados.'+warn)}return}
    const vid=uid(),n=nextN(S.ventas);
    if(await dbSet('ventas',vid,{n,...ventaFromPedido({...d,id})})&&await dbSet('pedidos',id,{...rest,...d,ventaId:vid})){
      const cid=g('cotId');if(cid&&find('cotizaciones',cid))await dbUpd('cotizaciones',cid,{estado:'Aceptada',pedidoId:id});
      closeModal();toast((cred?'Pedido registrado: venta VT-'+pad(n)+' enviada a Cartera ('+d.plazo+' días).':'Pedido registrado: el efectivo ya está en el Flujo de caja.')+warn)}return}
  if(kind==='ajuste'){d={pid:g('pid'),fecha:g('fecha'),cant:gn('cant'),motivo:g('motivo')};if(!d.pid||!d.cant)return toast('Seleccione el producto e indique la cantidad.')}
  if(await dbSet(colOf,id,{...rest,...d})){closeModal();toast('Guardado.')}
}
async function quick(act,id){
  const t=todayStr();
  if(act==='cobrar')openAbono(id);
  if(act==='recibir')await dbUpd('compras',id,{estado:'Recibida',fechaRecibo:t})&&toast('Entrada registrada en inventario.');
  if(act==='cotventa'){openForm('pedido',null,'cot:'+id)}
  if(act==='aprobar'){const q=find('pedidos',id);if(!q||(q.ventaId&&find('ventas',q.ventaId)))return;const vid=uid(),n=nextN(S.ventas);
    const sh=(q.items||[]).filter(i=>(+i.cant||0)>(D.stock[i.pid]||0));if(sh.length)return toast('Stock insuficiente de '+sh.map(i=>pname(i.pid)).join(', ')+'. Registre primero la orden de compra recibida.');
    if(await dbSet('ventas',vid,{n,...ventaFromPedido(q)})&&await dbUpd('pedidos',id,{ventaId:vid}))toast('Venta VT-'+pad(n)+' generada.')}
  if(act==='pagar')await dbUpd('compras',id,{pago:'Pagado',fechaPago:t})&&toast('Pago registrado en caja.');
}
async function seed(){
  const ex={ejemplo:true};let ok=true;
  const put=async(c,id,d)=>{if(ok)ok=await dbSet(c,id,{...d,...ex})};
  const cl=[['ej_c1','Restaurante El Fogón','Restaurante o bar','Activo','Barranquilla'],['ej_c2','Bar La Esquina','Restaurante o bar','Activo','Barranquilla'],['ej_c3','Tienda Gourmet Norte','Tienda o licorera','Activo','Barranquilla'],['ej_c4','Evento corporativo','Evento','Prospecto','Barranquilla']];
  for(const c of cl)await put('clientes',c[0],{nombre:c[1],tipo:c[2],estado:c[3],ciudad:c[4],contacto:'',tel:'',email:'',direccion:'',notas:'Dato de ejemplo',fechaAlta:START+'-01'});
  const d=n=>START+'-'+pad2(n);
  await put('compras','ej_o1',{n:1,fecha:d(2),proveedor:'Productor cervecero (ejemplo)',estado:'Recibida',fechaRecibo:d(4),pago:'Pagado',fechaPago:d(2),medio:'Transferencia',items:[{pid:'amber',cant:240,val:3200},{pid:'roja',cant:160,val:3500}],nota:''});
  await put('compras','ej_o2',{n:2,fecha:d(20),proveedor:'Productor cervecero (ejemplo)',estado:'Pedida',fechaRecibo:'',pago:'Pendiente',fechaPago:'',medio:'Transferencia',items:[{pid:'amber',cant:120,val:3250},{pid:'roja',cant:120,val:3500}],nota:''});
  const A=8000,R=8500;
  const vs=[[5,'ej_c1',[['amber',48,A],['roja',24,R]],'Transferencia','Pagado'],[8,'ej_c2',[['amber',24,A]],'Efectivo','Pagado'],[12,'ej_c3',[['roja',36,R]],'Nequi','Pagado'],[14,'',[['amber',6,A]],'Efectivo','Pagado'],[17,'ej_c1',[['amber',48,A],['roja',48,R]],'Transferencia','Pagado'],[20,'ej_c4',[['amber',12,A],['roja',12,R]],'Tarjeta','Pagado'],[23,'ej_c2',[['amber',36,A]],'Transferencia','Pendiente'],[24,'ej_c3',[['roja',24,R]],'Nequi','Pendiente']];
  let n=0;for(const v of vs){n++;await put('ventas','ej_v'+n,{n,vendedor:n%2?'Santiago':'Laura',fecha:d(v[0]),clienteId:v[1],items:v[2].map(i=>({pid:i[0],cant:i[1],val:i[2]})),medio:v[3],estado:v[4],fechaPago:v[4]==='Pagado'?d(v[0]):'',nota:''})}
  const ms=[['Ingreso','Aporte de socios','Aporte inicial de socios (ejemplo)',12000000,1,'Transferencia'],['Egreso','Inversión inicial','Registro sanitario y adecuaciones (ejemplo)',3500000,1,'Transferencia'],['Egreso','Marketing','Material gráfico y redes (ejemplo)',450000,15,'Transferencia'],['Egreso','Transporte','Fletes de entrega (ejemplo)',120000,5,'Efectivo']];
  n=0;for(const x of ms){n++;await put('movcaja','ej_m'+n,{tipo:x[0],cat:x[1],concepto:x[2],monto:x[3],fecha:d(x[4]),medio:x[5]})}
  await put('ajustes','ej_a1',{pid:'roja',fecha:d(10),cant:-2,motivo:'Botellas rotas (ejemplo)'});
  toast(ok?'Datos de ejemplo cargados.':'No se pudieron cargar todos los datos de ejemplo.');
}
async function unseed(){let c=0;for(const col of COLS)for(const x of S[col].filter(x=>x.ejemplo)){if(await dbDel(col,x.id))c++}toast(c?'Datos de ejemplo eliminados ('+c+').':'No hay datos de ejemplo.')}
async function csv(name){
  if(!DL)return toast('La descarga no está disponible en esta vista.');
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';let rows=[];
  if(name==='ventas')rows=[['N.º','Fecha','Cliente','Productos','Medio','Estado','Fecha de pago','Total']].concat(S.ventas.map(v=>['VT-'+pad(v.n),v.fecha,(D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional',(v.items||[]).map(i=>i.cant+' x '+pname(i.pid)).join('; '),v.medio,v.estado,v.fechaPago||'',v.total]));
  if(name==='compras')rows=[['N.º','Fecha','Proveedor','Ítems','Estado','Recepción','Pago','Medio','Total']].concat(S.compras.map(o=>['OC-'+pad(o.n),o.fecha,o.proveedor,(o.items||[]).map(i=>i.cant+' x '+(i.comp||'Cerveza')+' '+pname(i.pid)).join('; '),o.estado,o.fechaRecibo||'',o.pago,o.medio,o.total]));
  if(name==='cartera')rows=[['N.º','Cliente','Fecha','Vence','Días de atraso','Total','Abonado','Saldo']].concat(S.ventas.filter(v=>v.estado==='Pendiente'&&v.saldo>0).map(v=>['VT-'+pad(v.n),(D.C[v.clienteId]&&D.C[v.clienteId].nombre)||'Cliente ocasional',v.fecha,v.vence,Math.max(0,dayDiff(v.vence,todayStr())),v.total,v.abonado,v.saldo]));
  if(name==='activos')rows=[['Activo','Categoría','Ubicación','Estado','Marca','Modelo','Serial','Capacidad','Cantidad','Valor unitario','Valor total','Fecha de adquisición','Responsable','Notas']].concat(S.activos.map(a=>[a.nombre,a.categoria,locName(a),a.estado,a.marca||'',a.modelo||'',a.serial||'',a.capacidad||'',a.cant,a.valor||0,actVal(a),a.fechaAdq||'',a.responsable||'',a.nota||'']));
  if(name==='inventario')rows=[['Fecha','Producto','Tipo','Cantidad','Saldo','Referencia','Detalle']].concat(D.inv.map(r=>[r.f,pname(r.pid),r.t,r.q,r.saldo,r.ref,r.det]));
  if(name==='caja')rows=[['Fecha','Concepto','Origen','Categoría','Medio','Ingreso','Egreso','Saldo']].concat(D.cash.map(r=>[r.f,r.con,r.orig,r.cat,r.medio,r.t==='Ingreso'?r.m:0,r.t==='Egreso'?r.m:0,r.saldo]));
  try{await DL.save({filename:'sante-'+name+'-'+todayStr()+'.csv',data:'﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')})}catch(e){if(e&&e.code!=='declined')toast('No se pudo exportar el archivo.')}
}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{
  if(e.target.closest('.nav a,.tabbar a'))document.body.classList.remove('menu-open');
  const a=e.target.closest('[data-act]');if(!a)return;const act=a.dataset.act;
  if(act==='menu'){document.body.classList.toggle('menu-open');return}
  if(act==='logout'){logout();return}
  if(act==='clave'){openClave();return}
  if(act==='user'){openUser(a.dataset.id);return}
  if(act==='backup'){backup();return}
  if(act==='bkcancel'){BK=null;UI.bkarm=false;render();return}
  if(act==='restore'){if(!UI.bkarm){UI.bkarm=true;render();return}restore();return}
  if(act==='close'){closeModal();return}
  if(act==='cli-nuevo'){cliToggle(a.closest('form'));return}
  if(act==='new'){openForm(a.dataset.kind,null,a.dataset.preset);return}
  if(act==='edit'){const vv=a.dataset.kind==='venta'?find('ventas',a.dataset.id):null;if(vv&&vv.pedidoId&&find('pedidos',vv.pedidoId)){openForm('pedido',vv.pedidoId);return}openForm(a.dataset.kind,a.dataset.id);return}
  if(act==='prod'){openProd(a.dataset.id);return}
  if(act==='cliente'){openCliente(a.dataset.id);return}
  if(act==='rmlab'){const f=a.closest('form');f.querySelector('#f_etiquetaImg').value='';f.querySelector('#labprev').innerHTML='';const fi=f.querySelector('#labfile');if(fi)fi.value='';a.remove();return}
  if(act==='abono'){openAbono(a.dataset.id);return}
  if(act==='rmabono'){const v=find('ventas',a.dataset.id);if(v){const ab=(v.abonos||[]).filter(x=>x.id!==a.dataset.aid),upd={abonos:ab};if(v.estado==='Pagado'&&ab.reduce((s,x)=>s+(+x.monto||0),0)<(+v.total||0)-0.5){upd.estado='Pendiente';upd.fechaPago=''}dbUpd('ventas',v.id,upd).then(ok=>{if(ok){closeModal();toast('Pago eliminado.')}})}return}
  if(act==='addrow'){const f=a.closest('form'),box=f.querySelector('#items');box.insertAdjacentHTML('beforeend',itemRow({},box.dataset.kind));return}
  if(act==='rmrow'){const f=a.closest('form'),r=a.closest('.irow');if(f.querySelectorAll('.irow').length>1)r.remove();else r.querySelectorAll('input').forEach(i=>i.value='');refreshTotals(f);return}
  if(act==='del'){if(!a.classList.contains('arm')){a.classList.add('arm');a.textContent='Confirmar eliminación';return}
    const colOf={producto:'productos',cliente:'clientes',venta:'ventas',compra:'compras',mov:'movcaja',ajuste:'ajustes',activo:'activos',cotizacion:'cotizaciones',pedido:'pedidos'}[a.dataset.kind];
    const vv=a.dataset.kind==='venta'?find('ventas',a.dataset.id):null,pp=a.dataset.kind==='pedido'?find('pedidos',a.dataset.id):null;
    dbDel(colOf,a.dataset.id).then(async ok=>{if(ok){let both=false;if(vv&&vv.pedidoId&&find('pedidos',vv.pedidoId)){await dbDel('pedidos',vv.pedidoId);both=true}if(pp&&pp.ventaId&&find('ventas',pp.ventaId)){await dbDel('ventas',pp.ventaId);both=true}closeModal();toast(both?'Pedido y venta eliminados.':'Eliminado.')}});return}
  if(act==='seed'){seed();return}
  if(act==='unseed'){unseed();return}
  if(act==='vleg'){UI.vleg=!UI.vleg;render();return}
  if(act==='csv'){csv(a.dataset.name);return}
  if(['cobrar','recibir','pagar','cotventa','aprobar'].includes(act)){e.stopPropagation();quick(act,a.dataset.id)}
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#modal').hidden)closeModal();
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.pcard')){e.preventDefault();openProd(e.target.dataset.id)}
});
document.addEventListener('submit',e=>{if(e.target.id==='mform'){e.preventDefault();onSubmit(e.target)}});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='f_cliBuscar'){cliSync(t.closest('form'));return}
  if(t.dataset&&t.dataset.ui&&t.tagName==='INPUT'){UI[t.dataset.ui]=t.value;render();return}
  const f=t.closest&&t.closest('#mform');if(f&&t.closest('.irow'))refreshTotals(f);
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.ui&&t.tagName==='SELECT'){UI[t.dataset.ui]=t.value;render();return}
  const f=t.closest&&t.closest('#mform');
  if(f&&t.id==='labfile'){const file=t.files&&t.files[0];if(!file)return;if(!/^image\//.test(file.type)){toast('Seleccione un archivo de imagen.');t.value='';return}
    readLabel(file,u=>{if(!u){toast('No se pudo leer la imagen.');return}f.querySelector('#f_etiquetaImg').value=u;f.querySelector('#labprev').innerHTML=`<img src="${u}" alt="Vista previa de la etiqueta">`});return}
  if(f&&t.name==='tipo'&&f.querySelector('[name=monto][data-saldo]')){const m=f.querySelector('[name=monto]');if(t.value==='Saldo'){m.value=m.dataset.saldo;m.readOnly=true}else{m.value='';m.readOnly=false;m.focus()}return}
  if(f&&t.name==='clienteId'){const c=D.C[t.value],pl=f.querySelector('[name=plazo]'),co=f.querySelector('[name=condicion]');if(c&&c.plazo&&pl&&co&&co.value==='Crédito')pl.value=c.plazo}
  if(f&&t.name==='pid'){const row=t.closest('.irow'),box=f.querySelector('#items');if(row&&box){const p=D.P[t.value],val=row.querySelector('[name=val]');const cmp=row.querySelector('[name=comp]');if(p&&!val.value&&(!cmp||cmp.value==='Cerveza'))val.value=(box.dataset.kind==='venta'?p.precio:p.costo)||'';if(box.dataset.kind==='venta'){let h=row.querySelector('.hint');if(!h){h=document.createElement('span');h.className='hint';row.appendChild(h)}h.textContent=p?'Disponible: '+nf(D.stock[p.id]||0)+' und.':''}refreshTotals(f)}}
});
$('#modal').addEventListener('mousedown',e=>{if(e.target.id==='modal')closeModal()});
window.addEventListener('hashchange',route);

/* ---------- usuarios ---------- */
let USER=null,USERS=null;
const isAdmin=()=>!!USER&&USER.rol==='admin';
const VEND_VIEWS=['pedidos','ventas','clientes','productos','cotizaciones'];
const canView=id=>isAdmin()||VEND_VIEWS.includes(id);
const vendOpts=cur=>isAdmin()||!USER||!USER.vendedor?[...new Set(VENDEDORES.concat(cur?[cur]:[]))]:[USER.vendedor];
async function loadUsers(){try{USERS=(await api('usuarios')).usuarios}catch(e){USERS=[]}if(UI.view==='usuarios')render()}
function vUsuarios(){
  setHead('Usuarios','Personas que pueden entrar a la aplicación, con su rol y contraseña',btn('Nuevo usuario','user','','pri'));
  if(!USERS){loadUsers();return `<div class="card">${emptyHtml('Cargando usuarios…','')}</div>`}
  return `<div class="card">${tableWrap(`<table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Nombre como vendedor</th><th>Estado</th><th class="r"></th></tr></thead><tbody>${USERS.map(u=>`<tr><td><b>${esc(u.nombre)}</b>${USER&&u.id===USER.id?' '+pill('Usted','gold'):''}</td><td>${esc(u.usuario)}</td><td>${u.rol==='admin'?'Administrador':'Vendedor'}</td><td>${esc(u.vendedor||'—')}</td><td>${pill(u.activo?'Activo':'Inactivo',u.activo?'ok':'neu')}</td><td class="r"><button class="btn sm" data-act="user" data-id="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table>`)}</div><p class="mut small" style="margin-top:12px"><b>Administrador:</b> ve y modifica todo. <b>Vendedor:</b> registra pedidos y cotizaciones, consulta ventas, clientes y productos; no ve costos, compras, caja, cartera ni activos.</p>`;
}
function openUser(id){
  const u=(USERS||[]).find(x=>x.id===id)||{rol:'vendedor',activo:true};
  modal(id?'Editar usuario':'Nuevo usuario',`<div class="frow">${fld('Nombre completo','nombre',u.nombre||'','text','required')}${fld('Usuario para entrar','usuario',u.usuario||'','text',id?'readonly':'required pattern="[A-Za-z0-9._\\-]{3,40}" autocapitalize="none" autocomplete="off"')}</div><div class="frow">${sel('Rol','rol',[['vendedor','Vendedor'],['admin','Administrador']],u.rol)}${fld('Nombre como vendedor (aparece en pedidos y ventas)','vendedor',u.vendedor||'')}</div><div class="frow">${fld(id?'Nueva contraseña (deje vacío para no cambiarla)':'Contraseña (mínimo 8 caracteres)','clave','','password',(id?'':'required ')+'minlength="8" autocomplete="new-password"')}${id?sel('Estado','activo',[['si','Activo'],['no','Inactivo (no puede entrar)']],u.activo?'si':'no'):''}</div><div class="mut small">Entregue el usuario y la contraseña a la persona por un medio privado. Podrá cambiar su contraseña desde el menú.</div>`,id,'usuario',false);
}
function openClave(){
  modal('Cambiar mi contraseña',`${fld('Contraseña actual','actual','','password','required autocomplete="current-password"')}<div class="frow">${fld('Nueva contraseña (mínimo 8 caracteres)','nueva','','password','required minlength="8" autocomplete="new-password"')}${fld('Repita la nueva contraseña','repetir','','password','required minlength="8" autocomplete="new-password"')}</div>`,null,'clave',false);
}

/* ---------- conexión con el servidor ---------- */
async function api(path,method='GET',body){
  let r;
  try{r=await fetch('/api/'+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'})}
  catch(e){const er=new Error('red');er.code='sin_conexion';er.msg='Sin conexión con el servidor.';throw er}
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===401&&USER&&path!=='login'){USER=null;stopSync();showAuth('login')}
  if(!r.ok){const er=new Error('api');er.code=(j&&j.code)||('http_'+r.status);er.msg=(j&&j.error)||'';throw er}
  return j;
}
const KNOWN={},SUBS={};let syncing=null,again=false,timer=0;
async function syncNow(){
  if(!USER)return;
  if(syncing){again=true;return syncing}
  syncing=(async()=>{
    do{again=false;
      const r=await api('datos?k='+encodeURIComponent(JSON.stringify(KNOWN)));
      if(r.vendedores&&r.vendedores.length&&r.vendedores.join('|')!==VENDEDORES.join('|')){VENDEDORES=r.vendedores;schedule()}
      COLS.forEach(c=>{if(!r.cols.includes(c)&&!S.ready[c]){S.ready[c]=true;schedule()}});
      Object.keys(r.data).forEach(c=>{KNOWN[c]=r.ver[c];if(SUBS[c])SUBS[c]({docs:r.data[c].map(d=>({id:d.id,data:()=>d.data}))})});
    }while(again);
  })();
  try{await syncing}finally{syncing=null}
}
function startSync(){stopSync();timer=setInterval(()=>{if(document.visibilityState==='visible')syncNow().catch(()=>{})},5000)}
function stopSync(){clearInterval(timer);timer=0}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&USER)syncNow().catch(()=>{})});
const REMOTE={collection:col=>({
  onSnapshot:cb=>{SUBS[col]=cb},
  doc:id=>{const p='docs/'+col+'/'+encodeURIComponent(id);return {
    set:async d=>{await api(p,'PUT',d);await syncNow()},
    update:async d=>{await api(p,'PATCH',d);await syncNow()},
    delete:async()=>{await api(p,'DELETE');await syncNow()}}}})};
const DOWNLOADS={save:async({filename,data})=>{const u=URL.createObjectURL(new Blob([data]));const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);return {status:'saved'}}};

/* ---------- inicio de sesión ---------- */
function showAuth(mode,needKey){
  const el=$('#auth');document.body.classList.add('locked');
  const setup=mode==='setup';
  el.innerHTML=`<form class="authbox" id="authform" data-mode="${mode}"><img src="${IMG.logo}" alt="Santé Cervecería Artesanal"><h1>${setup?'Crear administrador':'Iniciar sesión'}</h1>${setup?'<p>Primera vez: cree el usuario administrador de la aplicación.</p>':''}
  ${setup?`<label class="fld"><span>Nombre completo</span><input name="nombre" required autocomplete="name"></label>`:''}
  <label class="fld"><span>Usuario</span><input name="usuario" required autocapitalize="none" autocomplete="username" ${setup?'pattern="[A-Za-z0-9._\\-]{3,40}"':''}></label>
  <label class="fld"><span>Contraseña${setup?' (mínimo 8 caracteres)':''}</span><input name="clave" type="password" required ${setup?'minlength="8" autocomplete="new-password"':'autocomplete="current-password"'}></label>
  ${setup?`<label class="fld"><span>Repita la contraseña</span><input name="clave2" type="password" required minlength="8" autocomplete="new-password"></label>`:''}
  ${setup&&needKey?`<label class="fld"><span>Llave de configuración (SETUP_KEY)</span><input name="llave" type="password" required></label>`:''}
  <div class="autherr" id="autherr" role="alert" hidden></div>
  <button class="btn pri" type="submit">${setup?'Crear y entrar':'Entrar'}</button></form>`;
  el.hidden=false;const f=el.querySelector('input');if(f)f.focus();
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='authform')return;e.preventDefault();
  const f=e.target,fd=new FormData(f),g=n=>(fd.get(n)||'').toString(),err=$('#autherr'),b=f.querySelector('button[type=submit]');
  const show=t=>{err.textContent=t;err.hidden=false};
  if(f.dataset.mode==='setup'&&g('clave')!==g('clave2'))return show('Las contraseñas no coinciden.');
  b.disabled=true;
  try{const r=await api(f.dataset.mode==='setup'?'setup':'login','POST',f.dataset.mode==='setup'?{nombre:g('nombre'),usuario:g('usuario'),clave:g('clave'),llave:g('llave')}:{usuario:g('usuario'),clave:g('clave')});enter(r)}
  catch(e2){show(e2.msg||'No se pudo iniciar sesión.');b.disabled=false}
});
function enter(r){
  USER=r.user;if(r.vendedores&&r.vendedores.length)VENDEDORES=r.vendedores;USERS=null;
  COLS.forEach(c=>{delete KNOWN[c];S[c]=[];S.ready[c]=false});
  $('#auth').hidden=true;$('#auth').innerHTML='';document.body.classList.remove('locked');
  $('#who').innerHTML=`<b>${esc(USER.nombre)}</b><br>${USER.rol==='admin'?'Administrador':'Vendedor'}<br><button type="button" class="link" data-act="clave">Cambiar contraseña</button> · <button type="button" class="link" data-act="logout">Cerrar sesión</button>`;
  route();syncNow().catch(()=>{});startSync();
}
async function logout(){try{await api('logout','POST',{})}catch(e){}USER=null;stopSync();closeModal();document.body.classList.remove('menu-open');showAuth('login')}

/* ---------- arranque ---------- */
$('#logo').src=IMG.logo;
DB=REMOTE;DL=DOWNLOADS;
COLS.forEach(col=>DB.collection(col).onSnapshot(snap=>{
  S[col]=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(col==='ventas'||col==='compras'||col==='cotizaciones'||col==='pedidos')S[col].forEach(x=>{x.total=tot(x.items)});
  if(col==='cotizaciones')S[col].forEach(x=>{x.vence=addDays(x.fecha,+x.vigencia||15)});
  S.ready[col]=true;schedule();
}));
(async()=>{
  try{const st=await api('estado');if(st.user)enter(st);else showAuth(st.setup?'setup':'login',st.llave)}
  catch(e){showAuth('login');const er=$('#autherr');if(er){er.textContent='Sin conexión con el servidor. Recargue la página.';er.hidden=false}}
})();

