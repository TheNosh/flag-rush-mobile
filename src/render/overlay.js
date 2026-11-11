// 2D-overlay (menu's, HUD, playcall, Play Maker): overgenomen uit het 2D-spel en getekend boven de 3D-scene.
// Virtuele canvasmaat 1600x900; main.js schaalt dit naar het venster.
import { LOGOS } from '../data/teams.js';
import { asset } from '../render/field.js';

export const W = 1600, H = 900;
const FD = '"Saira Condensed","Arial Narrow",sans-serif', FB = '"Barlow",system-ui,sans-serif';
const C = { night: '#08100c', chalk: '#eef3ee', dim: '#8c9a92', lamp: '#ffb547', rim: '#24342b', panel: 'rgba(9,14,11,.94)', card: '#121915', los: '#4aa3ff', fd: '#ffd23a', red: '#ff6d6d' };
const GC = { X: '#86a9ff', O: '#ff6d6d', SQ: '#ff8fd3', TRI: '#3fdcaa' };
const PB = { X: 'X', Y: 'TRI', Z: 'O', C: 'SQ' };
const EX0 = 500, EY0 = 160, EPY = 24;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let ctx, G, OFF = [], DEF = [], B, I, game, PLAYS, COVERS, AUD, TEAMS, project;
const teamOf = (i) => TEAMS[G.teamSel[i]];
const noRun = () => game.noRun();
const playAllowed = (i) => game.playAllowed(i);
const passOpen = () => game.passOpen();
const passBtn = (p) => game.passBtn(p);
const eRoute = (E, id) => (id === 'Q' ? (E.f.Q[2] || (E.f.Q[2] = [])) : E.f[id][2]);
let logosLoaded = false;
function loadLogos(teams) {
  if (logosLoaded) return; logosLoaded = true;
  teams.forEach((t) => { if (LOGOS[t.name]) { const im = new Image(); im.src = asset(LOGOS[t.name]); t.img = im; } });
}
const EIDS=['Q','C','X','Y','Z'],ENAME={Q:'Quarterback',C:'Center',X:'X-receiver',Y:'Y-receiver',Z:'Z-receiver'};
const ex=l=>EX0+l*EPY,ey=d=>EY0+(16-d)*EPY;

function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function ls(v){if('letterSpacing' in ctx)ctx.letterSpacing=v;}
function txt(s,x,y,font,col,align,base){ctx.font=font;ctx.fillStyle=col;ctx.textAlign=align||'left';ctx.textBaseline=base||'alphabetic';ctx.fillText(s,x,y);}
function fitTxt(s,x,y,maxW,size,pre,col,align,base){let sz=size;ctx.font=pre+' '+sz+'px '+FD;while(ctx.measureText(s).width>maxW&&sz>10){sz-=2;ctx.font=pre+' '+sz+'px '+FD;}txt(s,x,y,pre+' '+sz+'px '+FD,col,align,base);}
function drawLogo(t,x,y,sz){
  rr(x,y,sz,sz,sz*0.18);ctx.fillStyle='#f6f7f6';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=t.k;ctx.stroke();
  if(t.img&&t.img.complete&&t.img.naturalWidth){ctx.save();rr(x+2,y+2,sz-4,sz-4,sz*0.15);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(t.img,x+2,y+2,sz-4,sz-4);ctx.restore();}
  else{const ini=t.name.split(' ').filter(w=>w!=='THE').slice(0,2).map(w=>w[0]).join('');ctx.beginPath();ctx.arc(x+sz/2,y+sz/2,sz*0.38,0,Math.PI*2);ctx.fillStyle=t.c;ctx.fill();txt(ini,x+sz/2,y+sz/2+1,'800 '+Math.round(sz*0.34)+'px '+FD,t.ink,'center','middle');}
}
function line(x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function wrapText(s,x,y,maxW,lh,font,col){ctx.font=font;ctx.fillStyle=col;ctx.textAlign='left';ctx.textBaseline='alphabetic';const words=s.split(' ');let l='';
  for(const w of words){const t=l?l+' '+w:w;if(ctx.measureText(t).width>maxW&&l){ctx.fillText(l,x,y);y+=lh;l=w;}else l=t;}if(l)ctx.fillText(l,x,y);return y;}
const PILL={OPT:'OPTIONS',LS:'L',RS:'R',DP:'D-PAD'};
function glyphW(b,r){if(GC[b])return r*2;ctx.font='700 '+Math.round(r*0.95)+'px '+FD;return Math.max(r*2,ctx.measureText(PILL[b]||b).width+r*1.1);}
function glyph(b,x,y,r){
  r=r||13;ctx.save();
  if(GC[b]){
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle='#101418';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,255,255,.25)';ctx.stroke();
    ctx.strokeStyle=GC[b];ctx.lineWidth=Math.max(2,r*0.17);ctx.lineCap='round';ctx.lineJoin='round';const s=r*0.42;ctx.beginPath();
    if(b==='X'){ctx.moveTo(x-s,y-s);ctx.lineTo(x+s,y+s);ctx.moveTo(x+s,y-s);ctx.lineTo(x-s,y+s);}
    else if(b==='O')ctx.arc(x,y,s*1.05,0,Math.PI*2);
    else if(b==='SQ')ctx.rect(x-s*0.9,y-s*0.9,s*1.8,s*1.8);
    else{ctx.moveTo(x,y-s*1.1);ctx.lineTo(x+s*1.05,y+s*0.75);ctx.lineTo(x-s*1.05,y+s*0.75);ctx.closePath();}
    ctx.stroke();
  } else {
    const w=glyphW(b,r);rr(x-w/2,y-r,w,r*2,r*0.6);ctx.fillStyle='#101418';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='rgba(255,255,255,.35)';ctx.stroke();
    txt(PILL[b]||b,x,y+1,'700 '+Math.round(r*0.95)+'px '+FD,'#dfe6ea','center','middle');
  }
  ctx.restore();
}
function drawHintRow(items,y,cx){
  cx=cx||800;const r=14,gap=6,igap=36,LF='600 19px '+FB;
  const ws=items.map(([bs,l])=>{let w=0;bs.forEach((b,i)=>{w+=glyphW(b,r)+(i?gap:0);});if(bs.length&&l)w+=10;ctx.font=LF;w+=ctx.measureText(l).width;return w;});
  const total=ws.reduce((a,b)=>a+b,0)+igap*(items.length-1);let x=cx-total/2;
  items.forEach(([bs,l])=>{bs.forEach(b=>{const gw=glyphW(b,r);glyph(b,x+gw/2,y,r);x+=gw+gap;});if(bs.length)x+=10-gap;txt(l,x,y+1,LF,'#c9d3cd','left','middle');ctx.font=LF;x+=ctx.measureText(l).width+igap;});
}

function drawEditor(){
  const E=G.editor,l=Math.round(E.cx*2)/2,d=Math.round(E.cy*2)/2,FW=25*EPY,FH=24*EPY;
  ctx.fillStyle=C.night;ctx.fillRect(0,0,W,H);
  ls('4px');txt('PLAY MAKER',60,82,'italic 800 50px '+FD,C.chalk,'left');ls('0px');
  ls('3px');txt(PLAYS[E.idx].name,62,118,'700 20px '+FD,C.lamp,'left');ls('0px');
  // veld
  rr(EX0,EY0,FW,FH,10);ctx.fillStyle='#1f4a2a';ctx.fill();
  ctx.save();rr(EX0,EY0,FW,FH,10);ctx.clip();
  ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=1;for(let k=5;k<25;k+=5)line(ex(k),EY0,ex(k),EY0+FH);
  ctx.strokeStyle='rgba(255,255,255,.18)';for(let k=-5;k<=15;k+=5)line(EX0,ey(k),EX0+FW,ey(k));
  ctx.strokeStyle=C.los;ctx.lineWidth=3;line(EX0,ey(0),EX0+FW,ey(0));
  ctx.restore();
  for(let k=-5;k<=15;k+=5)txt(k===0?'LOS':(k>0?'+':'')+k,EX0-12,ey(k),'700 15px '+FD,k===0?C.los:C.dim,'right','middle');
  // routes
  for(const id of EIDS){
    const o=E.f[id],rt=eRoute(E,id),col=id==='Q'?C.lamp:GC[PB[id]],pts=[[o[0],o[1]],...rt];
    if(pts.length<2)continue;
    ctx.save();ctx.globalAlpha=E.sel===id?1:0.6;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=E.h===id?7:id==='Q'?2.5:3.5;ctx.lineJoin='round';ctx.lineCap='round';
    if(id==='Q')ctx.setLineDash([6,6]);
    ctx.beginPath();ctx.moveTo(ex(pts[0][1]),ey(pts[0][0]));for(const q of pts.slice(1))ctx.lineTo(ex(q[1]),ey(q[0]));ctx.stroke();ctx.setLineDash([]);
    for(const q of rt){ctx.beginPath();ctx.arc(ex(q[1]),ey(q[0]),4,0,Math.PI*2);ctx.fill();}
    if(id!=='Q'){const e=pts[pts.length-1],pv=pts[pts.length-2],a=Math.atan2(ey(e[0])-ey(pv[0]),ex(e[1])-ex(pv[1])),X=ex(e[1]),Y=ey(e[0]);
      if(o[3]!==0){ctx.beginPath();ctx.moveTo(X+Math.cos(a)*11,Y+Math.sin(a)*11);ctx.lineTo(X+Math.cos(a+2.4)*12,Y+Math.sin(a+2.4)*12);ctx.lineTo(X+Math.cos(a-2.4)*12,Y+Math.sin(a-2.4)*12);ctx.closePath();ctx.fill();}
      else{const b=a+Math.PI/2;ctx.lineWidth=4;line(X-Math.cos(b)*11,Y-Math.sin(b)*11,X+Math.cos(b)*11,Y+Math.sin(b)*11);}}
    ctx.restore();
  }
  // spelers
  for(const id of EIDS){
    const o=E.f[id],X=ex(o[1]),Y=ey(o[0]);
    if(E.sel===id){ctx.strokeStyle=C.lamp;ctx.lineWidth=3;ctx.beginPath();ctx.arc(X,Y,21,0,Math.PI*2);ctx.stroke();}
    if(id==='Q'){ctx.beginPath();ctx.arc(X,Y,14,0,Math.PI*2);ctx.fillStyle=C.lamp;ctx.fill();txt('Q',X,Y+1,'800 16px '+FD,'#1a1405','center','middle');}
    else{glyph(PB[id],X,Y,14);txt(id,X+20,Y-16,'800 16px '+FD,C.chalk,'left','middle');}
    if(E.h===id)txt('BAL',X,Y+26,'700 13px '+FD,C.lamp,'center','middle');
  }
  // cursor
  {const X=ex(l),Y=ey(d);ctx.strokeStyle='#ffffff';ctx.lineWidth=2;line(X-16,Y,X-5,Y);line(X+5,Y,X+16,Y);line(X,Y-16,X,Y-5);line(X,Y+5,X,Y+16);
   txt((d>0?'+':'')+d+' yd · '+l,X+20,Y+20,'600 14px '+FB,'#c9d3cd','left','middle');}
  // spelerslijst
  ls('3px');txt('SPELERS',60,200,'700 17px '+FD,C.lamp,'left','middle');ls('0px');
  EIDS.forEach((id,i)=>{const y=226+i*62,s=E.sel===id,n=eRoute(E,id).length;
    rr(56,y,380,52,12);ctx.fillStyle=s?'#18231d':C.card;ctx.fill();ctx.strokeStyle=s?C.lamp:C.rim;ctx.lineWidth=s?2:1;ctx.stroke();
    if(id==='Q'){ctx.beginPath();ctx.arc(84,y+26,12,0,Math.PI*2);ctx.fillStyle=C.lamp;ctx.fill();txt('Q',84,y+27,'800 14px '+FD,'#1a1405','center','middle');}
    else glyph(PB[id],84,y+26,13);
    txt(ENAME[id],108,y+19,'700 18px '+FB,C.chalk,'left','middle');
    txt(n?(n+(n>1?' routepunten':' routepunt')+(id!=='Q'?(E.f[id][3]===0?' · stopt':' · loopt door'):'')):(id==='Q'?'blijft staan':'nog geen route'),108,y+38,'500 14px '+FB,C.dim,'left','middle');
    if(E.h===id)txt('BALDRAGER',428,y+26,'700 13px '+FD,C.lamp,'right','middle');
  });
  txt(E.h?'RUN · handoff naar '+E.h:'PASSPLAY',60,560,'700 20px '+FD,E.h?C.red:'#3fdcaa','left','middle');
  wrapText(E.h?'Laat de route van '+E.h+' vlak langs de QB lopen: daar krijgt hij de bal.':'Met L2 maak je van de gekozen speler de baldrager (run).',60,592,370,22,'500 15px '+FB,C.dim);
  // modus en besturing
  const rx=1160;ls('3px');txt('MODUS',rx,200,'700 17px '+FD,C.lamp,'left','middle');ls('0px');
  ['pos','route'].forEach((m,i)=>{const on=E.mode===m,x=rx+i*190;rr(x,216,176,44,22);ctx.fillStyle=on?'rgba(255,181,71,.18)':'transparent';ctx.fill();ctx.strokeStyle=on?C.lamp:C.rim;ctx.lineWidth=on?2:1;ctx.stroke();
    txt(m==='pos'?'POSITIE':'ROUTE',x+88,239,'700 18px '+FD,on?C.chalk:C.dim,'center','middle');});
  const rows=[[['LS'],'Cursor bewegen (R2 = snel)'],[['L1','R1'],'Vorige / volgende speler'],[['SQ'],'Wissel positie / route'],[['X'],E.mode==='pos'?'Zet speler op de cursor':'Routepunt toevoegen'],[['O'],'Laatste routepunt weg'],[['TRI'],'Einde: doorlopen of stoppen'],[['L2'],'Handoff naar deze speler'],[['OPT'],'Opslaan of annuleren']];
  rows.forEach(([bs,t],i)=>{const y=296+i*40;let gx=rx;bs.forEach(b=>{const gw=glyphW(b,13);glyph(b,gx+gw/2,y,13);gx+=gw+6;});txt(t,rx+84,y+1,'500 17px '+FB,'#d5ddd8','left','middle');});
  wrapText('Klik op een speler om hem te kiezen. Met de muis kun je ook direct in het veld klikken. Toetsenbord: pijltjes, Spatie = ✕, 3 = □, 2 = ◯, 4 = △, Tab/R = L1/R1, H = L2, Esc = menu.',rx,640,380,21,'500 14px '+FB,C.dim);
  if(E.menu){
    ctx.fillStyle='rgba(6,10,8,.8)';ctx.fillRect(0,0,W,H);rr(560,280,480,320,18);ctx.fillStyle=C.panel;ctx.fill();ctx.strokeStyle=C.rim;ctx.lineWidth=1.5;ctx.stroke();
    ls('3px');txt(PLAYS[E.idx].name,800,334,'italic 800 34px '+FD,C.chalk,'center','middle');ls('0px');
    ['Opslaan en terug','Annuleren','Play leegmaken'].forEach((t,i)=>{const y=376+i*62,s=E.menuSel===i;rr(600,y,400,48,12);ctx.fillStyle=s?'#18231d':'transparent';ctx.fill();if(s){ctx.strokeStyle=i===2?C.red:C.lamp;ctx.lineWidth=2;ctx.stroke();}
      txt(t,800,y+25,'600 21px '+FB,s?(i===2?C.red:C.chalk):C.dim,'center','middle');});
    drawHintRow([[['DP'],'Kies'],[['X'],'Bevestig'],[['O'],'Terug naar de Play Maker']],830);
  }
}

const ord=n=>n+'E';
function clockStr(t){const s=Math.ceil(t);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function drawHUD(){
  rr(310,14,980,96,16);ctx.fillStyle=C.panel;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=C.rim;ctx.stroke();
  for(const i of [0,1]){
    const t=teamOf(i),left=i===0,x0=left?310:960;
    drawLogo(t,left?x0+18:x0+266,30,46);
    ls('2px');fitTxt(t.short,left?x0+74:x0+256,62,150,30,'700',C.chalk,left?'left':'right');
    txt(left?'JIJ':'CPU',left?x0+74:x0+256,90,'600 14px '+FB,C.dim,left?'left':'right');ls('0px');
    ctx.save();ctx.font='800 72px '+FD;ctx.fillStyle=C.chalk;ctx.textAlign=left?'right':'left';ctx.textBaseline='alphabetic';if('fontVariantNumeric' in ctx){}ctx.fillText(String(G.score[i]),left?x0+310:x0+20,92);ctx.restore();
    if(G.screen==='game'&&G.poss===i&&G.phase!=='final'&&G.phase!=='halftime'){ctx.font='600 14px '+FB;const w=ctx.measureText(left?'JIJ':'CPU').width;const bx=left?x0+74+w+18:x0+256-w-18;
      ctx.save();ctx.translate(bx,85);ctx.beginPath();ctx.ellipse(0,0,8,5,0,0,Math.PI*2);ctx.fillStyle='#a35a2a';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.2;line(-3,0,3,0);ctx.restore();}
  }
  ls('1px');txt(clockStr(G.clock),800,74,'800 58px '+FD,G.clock<30?C.red:C.chalk,'center');ls('0px');
  ls('3px');txt(G.half===1?'1E HELFT':'2E HELFT',800,98,'600 14px '+FB,C.dim,'center');ls('0px');
  // situation strip
  const segs=[];
  if(G.isPAT)segs.push(['EXTRA PUNT · '+G.patPts+(G.patPts>1?' PUNTEN':' PUNT'),'700 24px '+FD,C.lamp]);
  else{
    segs.push([ord(G.down)+' & '+(G.zone==='mid'?Math.max(1,Math.ceil(25-G.los)):'DOEL'),'700 24px '+FD,C.lamp]);
    const l=Math.round(G.los);segs.push(['   ·   '+(l<=25?'EIGEN '+l:(50-l)+' YARD VAN DOEL'),'600 20px '+FD,C.chalk]);
    if(G.zone==='goal')segs.push(['   ·   '+Math.ceil(50-G.los)+' YD TOT TD','600 20px '+FD,C.dim]);
  }
  ls('1.5px');let tw=0;for(const s of segs){ctx.font=s[1];tw+=ctx.measureText(s[0]).width;}
  const nr=noRun();let x=800-(tw+(nr?110:0))/2;
  for(const s of segs){txt(s[0],x,140,s[1],s[2],'left','middle');ctx.font=s[1];x+=ctx.measureText(s[0]).width;}
  if(nr){rr(x+16,128,94,24,12);ctx.fillStyle='rgba(255,109,109,.18)';ctx.fill();ctx.strokeStyle=C.red;ctx.lineWidth=1.5;ctx.stroke();txt('NO-RUN',x+63,141,'700 15px '+FD,C.red,'center','middle');}
  ls('0px');
}
function drawStatus(){
  const on=I.connected;rr(24,22,on?190:200,30,15);ctx.fillStyle='rgba(16,22,19,.85)';ctx.fill();ctx.strokeStyle=C.rim;ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(42,37,5,0,Math.PI*2);ctx.fillStyle=on?'#3fdcaa':'#5b6670';ctx.fill();
  ls('1.5px');txt(I.touch?'TOUCH':on?'CONTROLLER':'TOETSENBORD',56,38,'700 14px '+FD,on||I.touch?C.chalk:C.dim,'left','middle');ls('0px');
  if(G.toast){const a=Math.min(1,(2.6-G.toast.t)/0.4);ctx.save();ctx.globalAlpha=a;ctx.font='600 15px '+FB;const w=ctx.measureText(G.toast.text).width+28;
    rr(24,60,w,30,15);ctx.fillStyle='rgba(255,181,71,.16)';ctx.fill();ctx.strokeStyle=C.lamp;ctx.stroke();txt(G.toast.text,38,76,'600 15px '+FB,C.chalk,'left','middle');ctx.restore();}
}
function drawBanner(){
  const b=G.banner;if(!b)return;const t=b.t;
  const a=t<0.12?t/0.12:(t>b.dur-0.3?Math.max(0,(b.dur-t)/0.3):1),s=t<0.15?0.82+0.18*(t/0.15):1;
  const size=b.big?118:62;ctx.save();ctx.globalAlpha=a;ctx.translate(800,443);
  ctx.fillStyle='rgba(6,10,8,.72)';ctx.fillRect(-W/2,-size*0.62,W,size*1.24+(b.sub?36:0));ctx.scale(s,s);
  ls(b.big?'6px':'4px');ctx.font='italic 800 '+size+'px '+FD;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineWidth=8;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.strokeText(b.text,0,0);ctx.fillStyle=b.col;ctx.fillText(b.text,0,0);ls('0px');
  if(b.sub)txt(b.sub,0,size*0.55+12,'600 24px '+FB,C.chalk,'center','middle');
  ctx.restore();
}

function dim(a){ctx.fillStyle='rgba(6,10,8,'+(a||0.85)+')';ctx.fillRect(-3000,118,W+6000,H-118+3000);}
function card(x,y,w,h,sel,off){rr(x,y,w,h,14);ctx.fillStyle=sel?'#18231d':C.card;ctx.fill();ctx.lineWidth=sel?3:1.5;ctx.strokeStyle=sel?C.lamp:C.rim;ctx.stroke();if(off){ctx.fillStyle='rgba(0,0,0,.45)';ctx.fill();}}
function heading(t,sub){ls('3px');txt(t,125,206,'italic 800 40px '+FD,C.chalk,'left','alphabetic');ls('0px');if(sub)txt(sub,1475,206,'600 18px '+FB,C.dim,'right','alphabetic');}
function situation(){return G.isPAT?'Extra punt · alleen passen':ord(G.down)+' down · '+(G.zone==='mid'?Math.max(1,Math.ceil(25-G.los))+' yard tot het midden':Math.ceil(50-G.los)+' yard tot de touchdown');}
function drawPlayDiagram(play,x,y,w,h){
  ctx.save();rr(x,y,w,h,10);ctx.fillStyle='#1f4a2a';ctx.fill();ctx.clip();
  const mx=v=>x+v/25*w,my=d=>y+h-(d+7.5)/24*h;
  ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;for(let d=-5;d<=15;d+=5)line(x,my(d),x+w,my(d));
  ctx.strokeStyle=C.los;ctx.lineWidth=2;line(x,my(0),x+w,my(0));
  const f=play.f;
  for(const id of ['C','X','Y','Z']){
    const [d0,l0,rt,cont]=f[id],col=GC[PB[id]],pts=[{x:d0,y:l0},...rt.map(([a,b])=>({x:a,y:b}))];
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=play.h===id?6:3;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(mx(pts[0].y),my(pts[0].x));
    for(const p of pts.slice(1))ctx.lineTo(mx(p.y),my(p.x));ctx.stroke();ctx.lineWidth=3;
    if(pts.length<2)continue;
    const e=pts[pts.length-1],pv=pts[pts.length-2],a=Math.atan2(my(e.x)-my(pv.x),mx(e.y)-mx(pv.y)),ex=mx(e.y),ey=my(e.x);
    if(cont!==0){ctx.beginPath();ctx.moveTo(ex+Math.cos(a)*6,ey+Math.sin(a)*6);ctx.lineTo(ex+Math.cos(a+2.4)*8,ey+Math.sin(a+2.4)*8);ctx.lineTo(ex+Math.cos(a-2.4)*8,ey+Math.sin(a-2.4)*8);ctx.closePath();ctx.fill();}
    else{const b=a+Math.PI/2;line(ex-Math.cos(b)*7,ey-Math.sin(b)*7,ex+Math.cos(b)*7,ey+Math.sin(b)*7);}
  }
  for(const id of ['C','X','Y','Z'])glyph(PB[id],mx(f[id][1]),my(f[id][0]),9);
  if(f.Q[2]){ctx.strokeStyle=C.lamp;ctx.lineWidth=2.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(mx(f.Q[1]),my(f.Q[0]));for(const [a,b] of f.Q[2])ctx.lineTo(mx(b),my(a));ctx.stroke();ctx.setLineDash([]);}
  ctx.beginPath();ctx.arc(mx(f.Q[1]),my(f.Q[0]),7,0,Math.PI*2);ctx.fillStyle=C.lamp;ctx.fill();
  ctx.restore();
}
function drawPlaycall(){
  const page=Math.floor(G.sel/6),pages=Math.ceil(PLAYS.length/6);
  dim();heading('KIES JE PLAY',situation());
  for(let k=0;k<6;k++){
    const i=page*6+k;if(i>=PLAYS.length)break;const p=PLAYS[i];
    const cx=125+(k%3)*470,cy=230+Math.floor(k/3)*260,ok=playAllowed(i),sel=G.sel===i;
    card(cx,cy,440,230,sel,false);
    if(p.custom&&p.empty){
      rr(cx+14,cy+14,250,202,10);ctx.setLineDash([8,6]);ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
      txt('+',cx+139,cy+112,'300 90px '+FB,'rgba(255,255,255,.45)','center','middle');
      ls('2px');txt(p.name,cx+282,cy+52,'italic 800 26px '+FD,C.chalk,'left');ls('0px');
      wrapText('Nog leeg. Ontwerp je eigen play in de Play Maker.',cx+282,cy+84,144,22,'500 16px '+FB,'#b9c4bd');
      glyph('X',cx+296,cy+200,12);txt('Maken',cx+314,cy+201,'600 16px '+FB,C.chalk,'left','middle');continue;
    }
    drawPlayDiagram(p,cx+14,cy+14,250,202);
    ls('2px');fitTxt(p.name,cx+282,cy+52,146,30,'italic 800',ok?C.chalk:C.dim,'left','alphabetic');ls('0px');
    if(p.custom){glyph('TRI',cx+420,cy+28,11);}
    wrapText(p.desc,cx+282,cy+84,144,22,'500 16px '+FB,ok?'#b9c4bd':'#5f6b65');
    {const run=!!p.run;rr(cx+282,cy+188,64,26,13);ctx.fillStyle=run?'rgba(255,109,109,.18)':'rgba(63,220,170,.16)';ctx.fill();ctx.strokeStyle=run?C.red:'#3fdcaa';ctx.lineWidth=1.5;ctx.stroke();txt(run?'RUN':'PASS',cx+314,cy+202,'700 15px '+FD,run?C.red:'#3fdcaa','center','middle');
     if(!ok)txt('NO-RUN ZONE',cx+356,cy+202,'700 14px '+FD,C.red,'left','middle');}
  }
  ls('3px');txt('PAGINA '+(page+1)+' / '+pages,800,206,'700 18px '+FD,C.lamp,'center','alphabetic');ls('0px');
}
function drawDefDiagram(cov,x,y,w,h){
  ctx.save();rr(x,y,w,h,10);ctx.fillStyle='#1f4a2a';ctx.fill();ctx.clip();
  const mx=v=>x+v/25*w,my=d=>y+h-(d+6)/24*h;
  ctx.strokeStyle=C.los;ctx.lineWidth=2;line(x,my(0),x+w,my(0));
  const rec=[[0,3],[0,22],[-1,8],[0,12.5]];
  const pos={man:[[2,3.6],[2,21.4],[3.5,8],[10,12.5],[7,12.5]],c2:[[4,4.6],[4,20.4],[12,17.5],[12,7.5],[7,12.5]],c3:[[7,4],[7,21],[5,8],[13,12.5],[5,17]],c4:[[9,3.5],[9,21.5],[9,15.5],[9,9.5],[7,12.5]],blitz:[[2,3.6],[2,21.4],[7,9],[8,8],[7,16]]}[cov.id];
  cov.z.forEach(z=>{if(!z)return;ctx.beginPath();ctx.ellipse(mx(z.y),my(z.d),z.R/25*w*0.8,z.R/24*h*0.55,0,0,Math.PI*2);ctx.fillStyle=z.deep?'rgba(74,163,255,.22)':'rgba(255,181,71,.22)';ctx.fill();ctx.strokeStyle=z.deep?'rgba(74,163,255,.6)':'rgba(255,181,71,.6)';ctx.lineWidth=1.5;ctx.stroke();});
  ctx.setLineDash([5,5]);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;
  cov.m.forEach((m,i)=>{if(m==null)return;line(mx(pos[i][1]),my(pos[i][0]),mx(rec[m][1]),my(rec[m][0]));});ctx.setLineDash([]);
  cov.r.forEach((r,i)=>{if(!r)return;ctx.strokeStyle=C.red;ctx.fillStyle=C.red;ctx.lineWidth=3;const ax=mx(pos[i][1]),ay=my(pos[i][0]),bx=mx(12.5),by=my(-3.5);line(ax,ay,bx,by);
    const a=Math.atan2(by-ay,bx-ax);ctx.beginPath();ctx.moveTo(bx+Math.cos(a)*7,by+Math.sin(a)*7);ctx.lineTo(bx+Math.cos(a+2.4)*8,by+Math.sin(a+2.4)*8);ctx.lineTo(bx+Math.cos(a-2.4)*8,by+Math.sin(a-2.4)*8);ctx.closePath();ctx.fill();});
  for(const [d,yy] of rec){ctx.beginPath();ctx.arc(mx(yy),my(d),6,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=2;ctx.stroke();}
  ctx.beginPath();ctx.arc(mx(12.5),my(-4.5),6,0,Math.PI*2);ctx.stroke();
  for(const [d,yy] of pos){ctx.beginPath();ctx.arc(mx(yy),my(d),7.5,0,Math.PI*2);ctx.fillStyle=C.chalk;ctx.fill();ctx.strokeStyle='#0b120e';ctx.lineWidth=2;ctx.stroke();}
  ctx.restore();
}
function drawDefcall(){
  dim();heading('KIES JE DEKKING',situation());
  const n=COVERS.length,cw=270,gp=16,x0=(W-(n*cw+(n-1)*gp))/2;
  COVERS.forEach((c,i)=>{const cx=x0+i*(cw+gp),cy=230;card(cx,cy,cw,470,G.sel===i,false);drawDefDiagram(c,cx+12,cy+12,cw-24,220);
    ls('2px');txt(c.name,cx+18,cy+280,'italic 800 32px '+FD,C.chalk,'left');ls('0px');wrapText(c.desc,cx+18,cy+314,cw-36,23,'500 16px '+FB,'#b9c4bd');});
}
function drawPAT(){
  dim();heading('EXTRA PUNT','Alleen passen · één poging');
  [['1 PUNT','Vanaf de 5 yard. Korte afstand, grote kans.'],['2 PUNTEN','Vanaf de 12 yard. Meer ruimte nodig, dubbele beloning.']].forEach(([n,d],i)=>{
    const cx=320+i*500,cy=280;card(cx,cy,460,260,G.sel===i,false);ls('3px');txt(n,cx+30,cy+90,'italic 800 64px '+FD,i?C.lamp:C.chalk,'left');ls('0px');wrapText(d,cx+30,cy+140,400,28,'500 20px '+FB,'#b9c4bd');});
}
function drawAudible(){
  rr(330,529,940,120,16);ctx.fillStyle=C.panel;ctx.fill();ctx.strokeStyle=C.lamp;ctx.lineWidth=2;ctx.stroke();
  ls('3px');txt('AUDIBLE',360,529+32,'700 18px '+FD,C.lamp,'left','middle');ls('0px');
  AUD.forEach((pi,i)=>{const x=360+i*290,y=529+78;glyph(['SQ','X','O'][i],x+16,y,16);ls('2px');txt(PLAYS[pi].name,x+44,y+2,'italic 800 28px '+FD,C.chalk,'left','middle');ls('0px');});
  glyph('TRI',1120,529+32,12);txt('Annuleer',1140,529+33,'600 16px '+FB,C.dim,'left','middle');
}
function drawCenterCard(title,lines,col){
  dim(0.88);ls('8px');txt(title,800,330,'italic 800 120px '+FD,col||C.chalk,'center','middle');ls('0px');
  const t0=teamOf(0),t1=teamOf(1);
  ls('3px');drawLogo(t0,330,420,96);drawLogo(t1,1174,420,96);fitTxt(t0.short,640,470,190,34,'700',t0.c,'right','middle');fitTxt(t1.short,960,470,190,34,'700',t1.c,'left','middle');ls('0px');
  txt(G.score[0]+'  –  '+G.score[1],800,472,'800 78px '+FD,C.chalk,'center','middle');
  lines.forEach((l,i)=>txt(l,800,560+i*34,'600 22px '+FB,C.dim,'center','middle'));
}
const CTRL=[
 ['VOOR DE SNAP',[[['X'],'Snap'],[['TRI'],'Audible: 3 snelkeuzes'],[['R3'],'Camera: achter je team of van boven'],[['OPT'],'Pauze']]],
 ['QUARTERBACK',[[['X','O','SQ','TRI'],'Gooi naar die ontvanger'],[[],'Tik = lob · vasthouden = bullet'],[['R1'],'Bal weggooien'],[['LS'],'Bewegen achter de lijn']]],
 ['BALDRAGER',[[['LS'],'Lopen · R2 sprint (kost stamina)'],[['RS','SQ'],'Juke: flick R-stick of □'],[['O'],'Spin'],[['TRI'],'Hesitation: stop en versnel'],[[],'Moves werken het best op 1-3 yard van een verdediger']]],
 ['VERDEDIGING',[[['LS'],'Bewegen'],[['R2'],'Sprint'],[['X'],'Flag grijpen'],[['TRI'],'Onderscheppen of duiken'],[['L1'],'Wissel naar speler bij de bal']]]
];
function drawControls(tutorial){
  dim(0.9);rr(110,130,1380,640,18);ctx.fillStyle=C.panel;ctx.fill();ctx.strokeStyle=C.rim;ctx.lineWidth=1.5;ctx.stroke();
  ls('3px');txt('BESTURING',150,185,'italic 800 40px '+FD,C.chalk,'left');ls('0px');
  txt('PlayStation-controller · standaard-indeling',1450,185,'600 17px '+FB,C.dim,'right');
  CTRL.forEach(([t,rows],i)=>{const x=150+(i%2)*670,y=235+Math.floor(i/2)*225;ls('3px');txt(t,x,y,'700 18px '+FD,C.lamp,'left','middle');ls('0px');
    rows.forEach(([bs,l],j)=>{let gx=x;const yy=y+38+j*34;bs.forEach(b=>{const gw=glyphW(b,13);glyph(b,gx+gw/2,yy,13);gx+=gw+6;});txt(l,bs.length?Math.max(gx+8,x+60):x,yy+1,'500 18px '+FB,'#d5ddd8','left','middle');});});
  wrapText('Toetsenbord: pijltjes = bewegen · Spatie of 1 = ✕ · 2 of E = ◯ · 3 of Q = □ · 4 of W = △ · 5 of R = R1 · Shift = R2 · Tab = L1 · C = camera · P of Esc = Options · F = volledig scherm',150,700,1300,24,'500 16px '+FB,C.dim);
  if(tutorial)wrapText('Regels: 5 tegen 5, geen contact. Flag trekken is een tackle. 4 downs om het midden te halen, daarna 4 voor de touchdown. De QB mag niet zelf over de line of scrimmage lopen en moet de bal binnen 7 seconden kwijt zijn. Binnen 5 yard van de eindzone (no-run zone) mag je alleen passen.',150,742,1300,22,'500 16px '+FB,'#b9c4bd');
}
function drawPause(){
  dim(0.82);rr(520,250,560,G.pauseReason?470:420,18);ctx.fillStyle=C.panel;ctx.fill();ctx.strokeStyle=C.rim;ctx.lineWidth=1.5;ctx.stroke();
  ls('4px');txt('PAUZE',800,312,'italic 800 52px '+FD,C.chalk,'center','middle');ls('0px');
  let y0=370;if(G.pauseReason==='pad'){wrapText('Controller losgekoppeld. Sluit hem opnieuw aan en druk op een knop.',560,360,480,24,'600 17px '+FB,C.red);y0=420;}
  ['Doorgaan',G.poss===0?'Camera aanval: '+(G.camOff==='achter'?'achter de offense':'van boven'):'Camera verdediging: '+(G.camDef==='achter'?'achter de defense':'van boven'),'Besturing','Stoppen (naar titel)'].forEach((l,i)=>{const y=y0+i*62,s=G.pauseSel===i;rr(580,y,440,48,12);ctx.fillStyle=s?'#18231d':'transparent';ctx.fill();if(s){ctx.strokeStyle=C.lamp;ctx.lineWidth=2;ctx.stroke();}
    txt(l,800,y+25,'600 21px '+FB,s?C.chalk:C.dim,'center','middle');});
}

function drawTitle(){
  
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(8,16,12,.55)');g.addColorStop(0.6,'rgba(8,16,12,.85)');g.addColorStop(1,'rgba(8,16,12,.97)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ls('10px');txt('FLAG RUSH',800,330,'italic 800 200px '+FD,C.chalk,'center','middle');ls('0px');
  ctx.fillStyle=C.lamp;ctx.fillRect(560,430,480,5);
  ls('6px');txt('5 TEGEN 5 FLAG FOOTBALL  ·  IFAF-REGELS',800,480,'600 26px '+FD,C.dim,'center','middle');ls('0px');
  const on=I.connected||I.touch,id=(I.padId||'').replace(/\(.*?\)/g,'').trim().slice(0,38);
  ctx.font='700 18px '+FD;const label=I.touch&&!I.connected?'TOUCHBESTURING ACTIEF':on?'CONTROLLER VERBONDEN'+(id?' · '+id.toUpperCase():''):I.blocked?'CONTROLLER GEBLOKKEERD IN DEZE WEERGAVE':'GEEN CONTROLLER GEVONDEN';ls('2px');const pw=ctx.measureText(label).width+60;ls('0px');
  rr(800-pw/2,560,pw,40,20);ctx.fillStyle='rgba(16,22,19,.9)';ctx.fill();ctx.strokeStyle=on?'#3fdcaa':C.rim;ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.arc(800-pw/2+24,580,6,0,Math.PI*2);ctx.fillStyle=on?'#3fdcaa':'#5b6670';ctx.fill();ls('2px');txt(label,800-pw/2+40,581,'700 18px '+FD,on?C.chalk:C.dim,'left','middle');ls('0px');
  const a=reduceMotion?1:0.55+0.45*Math.sin(G.time*3.2);ctx.save();ctx.globalAlpha=a;
  if(on){glyph('X',690,660,20);txt('Druk op ✕ om te beginnen',720,662,'600 30px '+FB,C.chalk,'left','middle');}
  else if(I.blocked)txt('Download flag-rush.html en open het bestand in Chrome of Edge',800,662,'600 28px '+FB,C.chalk,'center','middle');
  else txt('Druk op een knop op je PlayStation-controller om te koppelen',800,662,'600 28px '+FB,C.chalk,'center','middle');
  ctx.restore();
  txt(I.touch?'Stuur met je linkerduim · knoppen rechts · Bluetooth-controller werkt ook':on?'':I.blocked?'Deze browserweergave laat geen controllers toe. Met Spatie speel je hier met het toetsenbord.':'Geen controller? Druk op Spatie om met het toetsenbord te spelen.',800,710,'500 19px '+FB,C.dim,'center','middle');
  txt(I.touch?'Tip: zet de telefoon op liggend en kies "Toevoegen aan beginscherm" voor volledig scherm':'Werkt het best in Chrome of Edge · F = volledig scherm',800,850,'500 16px '+FB,'#5f6b65','center','middle');
}
function drawTeams(){
  ctx.fillStyle='rgba(8,16,12,.85)';ctx.fillRect(0,0,W,H);
  ls('4px');txt('KIES JE TEAMS',800,170,'italic 800 56px '+FD,C.chalk,'center','middle');ls('0px');
  ['JIJ','CPU'].forEach((lab,r)=>{
    const t=teamOf(r),y=260+r*200,s=G.teamRow===r;
    ls('3px');txt(lab,370,y+65,'700 26px '+FD,s?C.lamp:C.dim,'right','middle');ls('0px');
    rr(420,y,760,130,18);ctx.fillStyle=t.c;ctx.fill();ctx.lineWidth=s?4:1.5;ctx.strokeStyle=s?C.lamp:t.k;ctx.stroke();
    drawLogo(t,438,y+12,106);ls('3px');fitTxt(t.name,566,y+68,470,70,'italic 800',t.ink,'left','middle');ls('0px');
    ctx.fillStyle=t.flag;ctx.fillRect(1060,y+42,14,46);ctx.fillRect(1084,y+42,14,46);txt('FLAGS',1079,y+106,'700 13px '+FD,t.ink,'center','middle');
    ctx.fillStyle=s?C.lamp:'rgba(255,255,255,.25)';for(const [ax,d] of [[395,-1],[1205,1]]){ctx.beginPath();ctx.moveTo(ax+d*10,y+65);ctx.lineTo(ax-d*6,y+52);ctx.lineTo(ax-d*6,y+78);ctx.closePath();ctx.fill();}
  });
  drawHintRow([[['DP'],'Rij en team kiezen'],[['X'],'Verder'],[['O'],'Terug']],780);
}

/* ---------- 3D-gebonden onderdelen ---------- */
function groundPath(pts) { let st = false; ctx.beginPath(); for (const [u, y] of pts) { const g = project(u, y, 0.03); if (!g) continue; if (!st) { ctx.moveTo(g.x, g.y); st = true; } else ctx.lineTo(g.x, g.y); } return st; }
function drawCoverage() {
  if (G.poss !== 1 || G.phase !== 'presnap') return;
  ctx.save();
  for (const d of DEF) {
    if (d.zone) {
      const z = d.zone, pts = [];
      for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; pts.push([z.x + Math.cos(a) * z.R * 0.6, clamp(z.y + Math.sin(a) * z.R * 0.75, 0, 25)]); }
      if (groundPath(pts)) { ctx.closePath(); ctx.fillStyle = z.deep ? 'rgba(74,163,255,.22)' : 'rgba(255,181,71,.24)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = z.deep ? 'rgba(74,163,255,.75)' : 'rgba(255,181,71,.8)'; ctx.stroke(); }
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; if (groundPath([[d.x, d.y], [z.x, z.y]])) ctx.stroke(); ctx.setLineDash([]);
    } else if (d.man) { ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5; if (groundPath([[d.x, d.y], [d.man.x, d.man.y]])) ctx.stroke(); ctx.setLineDash([]); }
    else if (d.rush) { ctx.strokeStyle = C.red; ctx.lineWidth = 3; if (groundPath([[d.x, d.y], [OFF[0].x + 0.8, OFF[0].y]])) ctx.stroke(); }
  }
  ctx.restore();
}
function drawRoutes() {
  ctx.save(); ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.setLineDash([9, 7]);
  for (const p of OFF) {
    if (!p.route || !p.btn) continue;
    const pts = [{ x: p.x, y: p.y }, ...p.route], l = pts[pts.length - 1];
    if (p.cont) pts.push({ x: Math.min(59.5, l.x + p.cont.x * 5), y: clamp(l.y + p.cont.y * 5, 0.5, 24.5) });
    ctx.strokeStyle = GC[p.btn]; groundPath(pts.map((q) => [q.x, q.y])); ctx.stroke();
  }
  ctx.restore();
}
const headPos = (p) => project(p.x, p.y, 2.45);
function drawPops() {
  for (const q of game.pops) {
    const g = project(q.u, q.v, 2.6); if (!g) continue;
    const a = 1 - q.t / 0.9;
    ctx.save(); ctx.globalAlpha = a; ls('2px'); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.font = 'italic 800 24px ' + FD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(q.text, g.x, g.y - q.t * 40); ctx.fillStyle = q.col; ctx.fillText(q.text, g.x, g.y - q.t * 40); ls('0px'); ctx.restore();
  }
}

export function drawOverlay(context, g, input, proj) {
  ctx = context; game = g; G = g.G; OFF = g.OFF; DEF = g.DEF; B = g.B; I = input; project = proj;
  PLAYS = g.PLAYS; COVERS = g.COVERS; AUD = g.AUD; TEAMS = g.TEAMS;
  loadLogos(TEAMS);
  ctx.clearRect(-3000, -3000, W + 6000, H + 6000);
  if (G.screen === 'title') { drawTitle(); drawStatus(); return; }
  if (G.screen === 'teams') { drawTeams(); drawStatus(); return; }
  if (G.screen === 'tutorial') { drawControls(true); drawHintRow([[['X'], 'Aftrap'], [['O'], 'Terug']], 800); drawStatus(); return; }
  if (G.editor) { drawEditor(); drawStatus(); return; }
  if (G.poss === 0 && G.phase === 'presnap') drawRoutes();
  drawCoverage();
  if (G.phase === 'live' && G.sub === 'pocket' && G.carrier === OFF[0] && G.liveT >= 4) {
    const sec = Math.max(1, Math.ceil(7 - G.liveT)), hp = headPos(OFF[0]);
    if (hp) { const f = 1 - ((7 - G.liveT) % 1); ctx.save(); ctx.translate(hp.x, hp.y - 28); ctx.scale(1 + f * 0.25, 1 + f * 0.25); ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.font = 'italic 800 54px ' + FD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(String(sec), 0, 0); ctx.fillStyle = sec === 1 ? C.red : C.lamp; ctx.fillText(String(sec), 0, 0); ctx.restore(); }
  }
  if (G.poss === 0 && (G.phase === 'presnap' || (G.phase === 'live' && ((G.sub === 'pocket' && G.carrier === OFF[0]) || passOpen())))) {
    for (const p of OFF) {
      const pb = G.phase === 'presnap' ? p.btn : passBtn(p); if (!pb) continue; const hp = headPos(p); if (!hp) continue;
      glyph(pb, hp.x, hp.y, 13);
      if (G.charge && G.charge.b === pb) { const f = Math.min(1, G.charge.t / 0.5); ctx.strokeStyle = G.charge.t >= 0.18 ? C.lamp : C.chalk; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hp.x, hp.y, 18, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke(); if (G.charge.t >= 0.18) { ls('2px'); txt('BULLET', hp.x, hp.y - 26, '700 13px ' + FD, C.lamp, 'center', 'middle'); ls('0px'); } }
    }
  }
  drawPops();
  drawHUD(); drawStatus(); drawBanner();
  if (G.phase === 'playcall') drawPlaycall();
  else if (G.phase === 'defcall') drawDefcall();
  else if (G.phase === 'pat') drawPAT();
  else if (G.phase === 'halftime') drawCenterCard('RUST', ['Tweede helft: ' + teamOf(1 - G.startPoss).name + ' begint aan de bal']);
  else if (G.phase === 'final') { const d = G.score[0] - G.score[1]; drawCenterCard(d > 0 ? 'GEWONNEN' : d < 0 ? 'VERLOREN' : 'GELIJKSPEL', ['Eindstand na 2 × 4 minuten'], d > 0 ? C.lamp : d < 0 ? C.red : C.chalk); }
  if (G.phase === 'presnap' && G.audible) drawAudible();
  let h = []; const userOff = G.poss === 0;
  if (G.phase === 'playcall') h = PLAYS[G.sel].custom ? [[['DP'], 'Kies play'], [['L1', 'R1'], 'Pagina'], [['X'], PLAYS[G.sel].empty ? 'Maken' : 'Bevestig'], [['TRI'], 'Bewerken in Play Maker']] : [[['DP'], 'Kies play'], [['L1', 'R1'], 'Vorige / volgende pagina'], [['X'], 'Bevestig'], [['OPT'], 'Pauze']];
  else if (G.phase === 'defcall') h = [[['DP'], 'Kies dekking'], [['X'], 'Bevestig'], [['OPT'], 'Pauze']];
  else if (G.phase === 'pat') h = [[['DP'], 'Kies'], [['X'], 'Bevestig']];
  else if (G.phase === 'presnap') h = userOff ? (G.audible ? [[['SQ', 'X', 'O'], 'Kies play'], [['TRI'], 'Annuleer']] : [[['X'], 'Snap'], [['TRI'], 'Audible'], [['R3'], 'Camera'], [['OPT'], 'Pauze']]) : [[['L1'], 'Wissel speler'], [['R3'], 'Camera'], [[], 'Tegenstander snapt de bal…']];
  else if (G.phase === 'live' && G.sub === 'ret') h = userOff ? [[['LS'], 'Bewegen'], [['R2'], 'Sprint'], [['X'], 'Flag grijpen'], [['L1'], 'Wissel speler']] : [[['LS'], 'Lopen'], [['R2'], 'Sprint'], [['RS', 'SQ'], 'Juke'], [['O'], 'Spin'], [['TRI'], 'Hesitation']];
  else if (G.phase === 'live') {
    if (userOff) { if (passOpen()) h = [[['X', 'O', 'SQ', 'TRI'], 'Gooi, kan nog achter de lijn'], [['LS'], 'Lopen'], [['RS'], 'Juke'], [['R2'], 'Sprint']]; else if (G.sub === 'pocket' || G.sub === 'snap') h = [[['X', 'O', 'SQ', 'TRI'], 'Gooi · tik = lob, vast = bullet'], [['R1'], 'Weggooien'], [['LS'], 'Bewegen']]; else if (G.sub === 'air') h = [[['LS'], 'Stuur je ontvanger naar de bal (of laat los: automatisch)']]; else h = [[['LS'], 'Lopen'], [['R2'], 'Sprint'], [['RS', 'SQ'], 'Juke'], [['O'], 'Spin'], [['TRI'], 'Hesitation']]; }
    else h = [[['LS'], 'Bewegen'], [['R2'], 'Sprint'], [['X'], 'Flag grijpen'], [['TRI'], 'Onderscheppen'], [['L1'], 'Wissel']];
  } else if (G.phase === 'dead') h = [[['X'], 'Verder']];
  else if (G.phase === 'halftime') h = [[['X'], 'Tweede helft']];
  else if (G.phase === 'final') h = [[['X'], 'Nieuwe wedstrijd']];
  if (h.length) drawHintRow(h, G.phase === 'defcall' ? 800 : 776);
  if (G.phase === 'presnap' || G.phase === 'live') { ls('2px'); txt(userOff ? 'JOUW PLAY  ·  ' + G.play.name : 'JOUW DEKKING  ·  ' + G.cover.name, 60, 850, '700 16px ' + FD, C.dim, 'left', 'middle'); ls('0px'); }
  if (G.paused) drawPauseOrControls();
}
function drawPauseOrControls() { if (G.pauseView === 'controls') { drawControls(false); drawHintRow([[['O'], 'Terug']], 800); } else drawPause(); }