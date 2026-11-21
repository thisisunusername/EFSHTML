/* 模拟 moveNpc 的格数行为，验证「每回合走一格」 */
function makeNpc(speed){
  return {x:0.5, y:0.5, speed:speed, path:[], budget:0, dir:0, floor:'2F'};
}
const W={'2F':{w:20,h:20,g:Array.from({length:20},()=>Array(20).fill(0))}};

function moveNpc(n,dt){
  var f=W[n.floor];
  if(!f || !n.path || n.path.length===0) return;
  if(n.budget===undefined || n.budget<=0){
    n.budget = Math.max(1, Math.round(n.speed * dt));
  }
  var guard=0;
  while(n.budget>0 && n.path && n.path.length>0 && guard<16){
    guard++;
    var t=n.path[0];
    var gx=t.x+0.5, gy=t.y+0.5;
    var dx=gx-n.x, dy=gy-n.y;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<0.001){ n.path.shift(); continue; }
    if(n.budget>=d){
      n.x=gx; n.y=gy;
      n.dir=Math.atan2(dy,dx);
      n.budget-=d;
      n.path.shift();
    } else {
      var sp=n.budget;
      n.x+=dx/d*sp;
      n.y+=dy/d*sp;
      n.dir=Math.atan2(dy,dx);
      n.budget=0;
    }
  }
  if(n.budget<0.05) n.budget=0;
}

const ENEMY_TURN=0.5;
[1.7, 1.95, 2.25, 2.55].forEach(speed=>{
  const n=makeNpc(speed);
  // 一条 10 格的直线路径
  n.path=[];
  for(let i=1;i<=10;i++) n.path.push({x:i,y:0});
  const trace=[];
  for(let turn=1;turn<=6;turn++){
    n.budget=0;                       // 模拟 runEnemyTurn 的重置
    const bx=n.x;
    moveNpc(n, ENEMY_TURN);
    trace.push('T'+turn+':'+(n.x-bx).toFixed(2));
  }
  console.log('speed='+speed+' → 每回合位移: '+trace.join(' '));
});
console.log('\n期望：每回合位移约 1.00 格');
