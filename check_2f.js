const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('/tmp/efsrepo/full/b_world.js','utf8');
/* b_world.js 里的 DIFF/ITEM/W 名字现在都包了 T()，
   单独跑这个检查时必须补一个恒等函数桩，否则 ReferenceError。 */
const T=(x)=>x;
const ctx={console, Math, Int32Array, JSON, T};
vm.createContext(ctx);
vm.runInContext(src+'\nbuildWorld();\nthis.__W=W;', ctx);
const W=ctx.__W;
const f=W['2F'];
console.log('2F 尺寸:', f.w+'x'+f.h);
let bad=[];
function walk(x,y,name){
  const ix=Math.floor(x), iy=Math.floor(y);
  if(ix<0||iy<0||ix>=f.w||iy>=f.h){ bad.push(name+' 越界 ('+x+','+y+')'); return; }
  if(f.g[iy][ix]===1) bad.push(name+' 落在墙里 ('+x+','+y+')');
}
f.patrol.forEach((p,i)=>walk(p.x,p.y,'patrol['+i+']'));
f.objs.forEach((o,i)=>walk(o.x,o.y,'obj['+i+'] '+o.t));
// 房间中心可走性
f.rooms.forEach(r=>{
  const cx=Math.floor((r.x0+r.x1)/2), cy=Math.floor((r.y0+r.y1)/2);
  if(f.g[cy][cx]===1) bad.push('房间「'+r.name+'」中心是墙');
});
// 连通性：从大门厅(4,12) BFS，看能否到达所有房间中心
const seen=new Set(); const q=[[4,12]]; seen.add('4,12');
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
while(q.length){
  const [x,y]=q.pop();
  for(const [dx,dy] of dirs){
    const nx=x+dx, ny=y+dy;
    if(nx<0||ny<0||nx>=f.w||ny>=f.h) continue;
    if(f.g[ny][nx]===1) continue;
    const k=nx+','+ny;
    if(seen.has(k)) continue;
    seen.add(k); q.push([nx,ny]);
  }
}
f.rooms.forEach(r=>{
  const cx=Math.floor((r.x0+r.x1)/2), cy=Math.floor((r.y0+r.y1)/2);
  if(!seen.has(cx+','+cy)) bad.push('房间「'+r.name+'」不可达');
});
f.patrol.forEach((p,i)=>{
  const k=Math.floor(p.x)+','+Math.floor(p.y);
  if(!seen.has(k)) bad.push('patrol['+i+'] 不可达');
});
console.log('可达格子数:', seen.size);
console.log(bad.length? '问题:\n'+bad.join('\n') : '✓ 全部检查通过');
