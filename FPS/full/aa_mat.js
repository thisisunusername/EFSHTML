/* ============ aa_mat.js：程序化 PBR 材质系统 ============

 【为什么要有这个文件】
 以前整个场景是 `new MeshStandardMaterial({color:0xd9c6a3, roughness:.85})` ——
 一个纯色 + 一个粗糙度，没有任何纹理。远景看还行，走近了就是一块块塑料。
 参照物是 /tmp/saltline 的材质工厂，它用的是标准 PBR 三件套：
     map         = albedo（颜色）
     normalMap   = normal（法线，让平面有凹凸感）
     roughnessMap+metalnessMap+aoMap = ORM（三张打包进一张图，省纹理单元）

 【为什么用 Canvas 现场画，而不是外链图片】
 这个项目是「单个 HTML 文件」分发的，不能带资源目录。
 外链图片会让 index.html 依赖外部文件，破坏「拷一个文件就能玩」。
 Canvas 程序化生成的纹理会把代码体积增加几十 KB，但换来：
   · 零外部依赖，仍然单文件
   · 可以随时调参数（砖缝宽度、噪点强度）
   · 手机端不需要额外 HTTP 请求

 【性能考虑】
 纹理是启动时生成一次、全局缓存的。同一个纹理只画一次，
 之后所有同材质的几何体共享它（Map 缓存）。
 1024² 的 Canvas 生成大约 10~30ms，8 种材质约 0.2 秒，
 在 loading 阶段一次性付清，游戏内零开销。
*/

/* ---------- 基础工具：可复现的伪随机 ----------
   用固定种子，保证每次打开游戏纹理长得一样。
   如果每帧随机，墙上的污渍会跳舞。 */
function matRand(seed){
  let s = seed >>> 0;
  return function(){
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/* 值噪声：给纹理加"不规则的脏感"。
   纯随机是白噪声（像电视雪花），值噪声有块状连续性，更像真实污渍。 */
function matNoiseGrid(rnd, size){
  const g = [];
  for(let y=0;y<=size;y++){
    g[y]=[];
    for(let x=0;x<=size;x++) g[y][x]=rnd();
  }
  return g;
}
function matSmooth(t){ return t*t*(3-2*t); }
function matSampleNoise(g, size, u, v){
  const x0=Math.floor(u*size), y0=Math.floor(v*size);
  const fx=matSmooth(u*size-x0), fy=matSmooth(v*size-y0);
  const x1=(x0+1)%size, y1=(y0+1)%size;
  const a=g[y0%size][x0%size], b=g[y0%size][x1], c=g[y1][x0%size], d=g[y1][x1];
  return (a*(1-fx)+b*fx)*(1-fy) + (c*(1-fx)+d*fx)*fy;
}
/* 多层噪声叠加（fBm）：保留给需要逐像素精确取的场合。
   【注意】各绘制函数里已改成「先算 1/4 分辨率噪声表 + 双线性插值」，
   不再逐像素调这个函数（那样 512² 会有 780 万次函数调用，单张 1.3 秒）。 */
function matFbm(grids, sizes, u, v){
  let v0=0, amp=1, tot=0;
  for(let i=0;i<grids.length;i++){
    v0 += matSampleNoise(grids[i], sizes[i], u, v)*amp;
    tot += amp; amp*=0.5;
  }
  return v0/tot;
}

/* ---------- Canvas 创建 ---------- */
function matCanvas(size){
  const c=document.createElement('canvas');
  c.width=c.height=size;
  return c;
}
/* 从灰度图生成法线贴图（Sobel 算子）。
   原理：把亮度当高度场，算梯度 → 梯度就是法线方向。
   这一步是「平面变有凹凸」的关键，没有它砖缝只是颜色不同，摸上去还是平的。 */
function matNormalFromHeight(srcCanvas, strength){
  const w=srcCanvas.width, h=srcCanvas.height;
  const sctx=srcCanvas.getContext('2d');
  const src=sctx.getImageData(0,0,w,h).data;
  const out=matCanvas(w);
  const octx=out.getContext('2d');
  const img=octx.createImageData(w,h);
  const d=img.data;
  /* 【性能】原来 lum() 是个闭包函数，512×512 的图每像素要调 9 次，
     合计 235 万次函数调用 + 每次两次取模 —— 单张法线贴图就要 1.7 秒。
     现在把亮度预先算进一张 Float32 表（只算一遍），循环里直接查表，
     并且把行首尾的环绕用边界判断处理，不再对每像素取模。 */
  const lum=new Float32Array(w*h);
  for(let i=0,p=0;i<lum.length;i++,p+=4){
    lum[i]=(src[p]*0.299 + src[p+1]*0.587 + src[p+2]*0.114)*(1/255);
  }
  const st = strength===undefined?2:strength;
  for(let y=0;y<h;y++){
    const ym=(y-1+h)%h, yp=(y+1)%h;
    const rowC=y*w, rowU=ym*w, rowD=yp*w;
    for(let x=0;x<w;x++){
      const xm=(x-1+w)%w, xp=(x+1)%w;
      /* Sobel 梯度（全部查表，无函数调用） */
      const tl=lum[rowU+xm], t=lum[rowU+x], tr=lum[rowU+xp];
      const l =lum[rowC+xm],                r =lum[rowC+xp];
      const bl=lum[rowD+xm], b=lum[rowD+x], br=lum[rowD+xp];
      const dx=(tr+2*r+br)-(tl+2*l+bl);
      const dy=(bl+2*b+br)-(tl+2*t+tr);
      /* 法线向量 (-dx*st, -dy*st, 1) 归一化后映射到 RGB */
      let nx=-dx*st, ny=-dy*st, nz=1;
      const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      nx/=len; ny/=len; nz/=len;
      const i=(y*w+x)<<2;
      d[i]  =(nx*0.5+0.5)*255;
      d[i+1]=(ny*0.5+0.5)*255;
      d[i+2]=(nz*0.5+0.5)*255;
      d[i+3]=255;
    }
  }
  octx.putImageData(img,0,0);
  return out;
}
/* 从灰度图生成 ORM 贴图：R=AO、G=roughness、B=metalness。
   打包成一张是 PBR 的标准做法，能省两个纹理单元。
   这里我们只做「粗糙度有变化」的版本（AO 已经烘焙进 albedo 的暗部了）。 */
function matOrmFromGray(srcCanvas, roughBase, metalBase){
  const w=srcCanvas.width, h=srcCanvas.height;
  const src=srcCanvas.getContext('2d').getImageData(0,0,w,h).data;
  const out=matCanvas(w);
  const octx=out.getContext('2d');
  const img=octx.createImageData(w,h);
  const d=img.data;
  for(let i=0;i<src.length;i+=4){
    const g=(src[i]*0.299+src[i+1]*0.587+src[i+2]*0.114)*(1/255);
    /* 【性能】去掉 Math.round —— Uint8ClampedArray 赋值本身就会截断取整，
       512×512 有 78 万次 Math.round 调用，纯属浪费。 */
    d[i]  =255*(0.75+g*0.25);                                   // AO：暗处更暗
    const rr=roughBase+(0.5-g)*0.3;
    d[i+1]=255*(rr<0?0:(rr>1?1:rr));                            // roughness
    d[i+2]=255*(metalBase>1?1:metalBase);                       // metalness
    d[i+3]=255;
  }
  octx.putImageData(img,0,0);
  return out;
}
function matToTexture(canvas, repeat){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(repeat||1, repeat||1);
  /* 各向异性：斜看地面时纹理不会糊成一片。手机上 4 足够，
     8 以上在移动 GPU 上收益递减而带宽翻倍。 */
  t.anisotropy=4;
  if('colorSpace' in t) t.colorSpace=THREE.SRGBColorSpace;
  t.needsUpdate=true;
  return t;
}
function matOrmToTexture(canvas, repeat){
  const t=new THREE.CanvasTexture(canvas);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(repeat||1, repeat||1);
  t.anisotropy=4;
  /* ORM 是数据贴图，必须用线性空间，不能 sRGB —— 
     否则粗糙度会被伽马校正，材质看起来会"发亮得不自然"。 */
  if('colorSpace' in t) t.colorSpace=THREE.NoColorSpace;
  t.needsUpdate=true;
  return t;
}

/* ============================================================
   各材质的绘制函数
   每个函数往 canvas 上画"颜色"，同时填一张同尺寸的 height canvas
   用来生成法线（砖缝、木纹这种要有凹凸，涂装面就不需要）。
   ============================================================ */

/* ---- 1. 水泥墙（教学楼主色 0xd9c6a3 那种米黄）---- */
function matDrawConcrete(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const g1=matNoiseGrid(rnd,8), g2=matNoiseGrid(rnd,24), g3=matNoiseGrid(rnd,64);
  const img=ctx.createImageData(S,S), d=img.data;
  const himg=hctx.createImageData(S,S), hd=himg.data;
  /* 基色拆成 RGB */
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  /* 【性能】原来逐像素调 matFbm → matSampleNoise，每像素约 30 次函数调用，
     512² 就是 780 万次，单张要 1.3 秒。这里把三层噪声预先按行取样：
     噪声是低频的（8/24/64 格），没必要每个像素都重算，
     隔 4 个像素取一次再线性插值，视觉上看不出区别，耗时降到约 1/4。 */
  const step=4, gw=Math.ceil(S/step)+1;
  const nb1=new Float32Array(gw*gw), nb2=new Float32Array(gw*gw), nb3=new Float32Array(gw*gw);
  for(let gy=0;gy<gw;gy++){
    const v=gy*step/S;
    for(let gx=0;gx<gw;gx++){
      const u=gx*step/S;
      nb1[gy*gw+gx]=matSampleNoise(g1,8,u,v);
      nb2[gy*gw+gx]=matSampleNoise(g2,24,u,v);
      nb3[gy*gw+gx]=matSampleNoise(g3,64,u,v);
    }
  }
  const bilin=(buf,gx,gy)=>{
    let x0=gx/step, y0=gy/step;
    let ix=x0|0, iy=y0|0;
    if(ix>gw-2) ix=gw-2;
    if(iy>gw-2) iy=gw-2;
    const fx=x0-ix, fy=y0-iy;
    const ra=buf[iy*gw+ix], rb=buf[iy*gw+ix+1];
    const rc=buf[(iy+1)*gw+ix], re=buf[(iy+1)*gw+ix+1];
    const top=ra+(rb-ra)*fx, bot=rc+(re-rc)*fx;
    return top+(bot-top)*fy;
  };
  for(let y=0;y<S;y++){
    for(let x=0;x<S;x++){
      /* fBm：3 层加权叠加（等价于原来的 matFbm，但走上采样表 + 双线性插值） */
      const n=bilin(nb1,x,y)*0.5 + bilin(nb2,x,y)*0.3 + bilin(nb3,x,y)*0.2;
      /* 水泥的颗粒感：高频细节 */
      const grain=(rnd()-0.5)*14;
      /* 污渍：低频噪声，暗部压深一点 */
      const dirt=(n-0.5)*34;
      const vars=62+ (1-n)*46;
      const i=(y*S+x)<<2;
      d[i]  =Math.max(0,Math.min(255, br*vars/255 + dirt + grain));
      d[i+1]=Math.max(0,Math.min(255, bg*vars/255 + dirt + grain));
      d[i+2]=Math.max(0,Math.min(255, bb*vars/255 + dirt*0.94 + grain));
      d[i+3]=255;
      const hv=128 + (n-0.5)*70 + grain*0.6;
      hd[i]=hd[i+1]=hd[i+2]=Math.max(0,Math.min(255,hv)); hd[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  hctx.putImageData(himg,0,0);
  /* 横向模板缝（浇筑混凝土留下的），每 1/3 高度一条 */
  ctx.strokeStyle='rgba(0,0,0,.14)';
  hctx.strokeStyle='rgba(0,0,0,.55)';
  for(let k=1;k<3;k++){
    const y=S*k/3;
    ctx.lineWidth=2; hctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S,y); ctx.stroke();
    hctx.beginPath(); hctx.moveTo(0,y); hctx.lineTo(S,y); hctx.stroke();
  }
  /* 竖向雨痕：从缝隙往下流的水渍，极其细微但很有效 */
  for(let k=0;k<14;k++){
    const x=rnd()*S, w=1+rnd()*3, a=0.03+rnd()*0.05;
    ctx.fillStyle='rgba(20,18,14,'+a+')';
    ctx.fillRect(x,0,w,S);
  }
}

/* ---- 2. 砖墙（围墙 0x8a9aa8 那种灰蓝）---- */
function matDrawBrick(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const rows=16, cols=8;
  const bh=S/rows, bw=S/cols;
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  /* 先铺砂浆底 */
  ctx.fillStyle='rgb('+Math.round(br*0.72)+','+Math.round(bg*0.72)+','+Math.round(bb*0.72)+')';
  ctx.fillRect(0,0,S,S);
  hctx.fillStyle='rgb(80,80,80)'; hctx.fillRect(0,0,S,S);
  for(let r=0;r<rows;r++){
    /* 错缝：奇数行整体偏移半块 */
    const off=(r%2)?bw*0.5:0;
    for(let c=-1;c<=cols;c++){
      const x=c*bw+off+2, y=r*bh+2;
      const w=bw-4, h=bh-4;
      /* 每块砖自己的色调微差 */
      const t=0.82+rnd()*0.36;
      const cr=Math.min(255,br*t), cg=Math.min(255,bg*t), cb=Math.min(255,bb*t);
      ctx.fillStyle='rgb('+Math.round(cr)+','+Math.round(cg)+','+Math.round(cb)+')';
      ctx.fillRect(x,y,w,h);
      /* 砖面本身也有细微颗粒 */
      for(let k=0;k<10;k++){
        const px=x+rnd()*w, py=y+rnd()*h;
        ctx.fillStyle='rgba(0,0,0,'+(0.02+rnd()*0.05)+')';
        ctx.fillRect(px,py,1+rnd()*2,1+rnd()*2);
      }
      /* 高度图：砖面亮（凸），缝隙暗（凹） */
      const hv=Math.round(170+rnd()*40);
      hctx.fillStyle='rgb('+hv+','+hv+','+hv+')';
      hctx.fillRect(x,y,w,h);
    }
  }
}

/* ---- 3. 沥青地面 / 操场跑道 ---- */
function matDrawAsphalt(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const g1=matNoiseGrid(rnd,16), g2=matNoiseGrid(rnd,48);
  const img=ctx.createImageData(S,S), d=img.data;
  const himg=hctx.createImageData(S,S), hd=himg.data;
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  /* 噪声上采样表（同 matDrawConcrete 的做法）：噪声是低频的，
     隔 4 像素取一次 + 双线性插值，省掉 780 万次函数调用。 */
  const step=4, gw=(S/step|0)+1;
  const nb1=new Float32Array(gw*gw), nb2=new Float32Array(gw*gw);
  for(let gy=0;gy<gw;gy++)for(let gx=0;gx<gw;gx++){
    nb1[gy*gw+gx]=matSampleNoise(g1,16,gx*step/S,gy*step/S);
    nb2[gy*gw+gx]=matSampleNoise(g2,48,gx*step/S,gy*step/S);
  }
  for(let y=0;y<S;y++){
    const y0=(y/step)|0, iy=y0>gw-2?gw-2:y0, fy=y/step-iy;
    for(let x=0;x<S;x++){
      const x0=(x/step)|0, ix=x0>gw-2?gw-2:x0, fx=x/step-ix;
      const r1=iy*gw+ix, r2=(iy+1)*gw+ix;
      const t1=nb1[r1]+(nb1[r1+1]-nb1[r1])*fx, b1=nb1[r2]+(nb1[r2+1]-nb1[r2])*fx;
      const t2=nb2[r1]+(nb2[r1+1]-nb2[r1])*fx, b2=nb2[r2]+(nb2[r2+1]-nb2[r2])*fx;
      const n=(t1+(b1-t1)*fy)*0.65 + (t2+(b2-t2)*fy)*0.35;
      /* 沥青的碎石颗粒：细密高频噪点 */
      const stone=(rnd()<0.06)?(rnd()*46):0;
      const i=(y*S+x)<<2;
      const v=0.72+n*0.4;
      d[i]  =Math.min(255, br*v+stone);
      d[i+1]=Math.min(255, bg*v+stone);
      d[i+2]=Math.min(255, bb*v+stone);
      d[i+3]=255;
      hd[i]=hd[i+1]=hd[i+2]=120+(rnd()-0.5)*90; hd[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  hctx.putImageData(himg,0,0);
  /* 裂缝：随机折线，是"旧路面"最有说服力的细节 */
  for(let k=0;k<5;k++){
    let x=rnd()*S, y=rnd()*S;
    ctx.strokeStyle='rgba(0,0,0,.35)';
    hctx.strokeStyle='rgba(0,0,0,.7)';
    ctx.lineWidth=1.5; hctx.lineWidth=2;
    ctx.beginPath(); hctx.beginPath();
    ctx.moveTo(x,y); hctx.moveTo(x,y);
    for(let s=0;s<14;s++){
      x+=(rnd()-0.5)*S*0.16; y+=(rnd()-0.5)*S*0.1;
      ctx.lineTo(x,y); hctx.lineTo(x,y);
    }
    ctx.stroke(); hctx.stroke();
  }
}

/* ---- 4. 草地 ---- */
function matDrawGrass(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const g1=matNoiseGrid(rnd,8), g2=matNoiseGrid(rnd,32), g3=matNoiseGrid(rnd,96);
  const img=ctx.createImageData(S,S), d=img.data;
  const himg=hctx.createImageData(S,S), hd=himg.data;
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  /* 噪声上采样表：三层 fBm 预先在 1/4 分辨率上算好，循环里只做双线性插值 */
  const step=4, gw=(S/step|0)+1;
  const nb1=new Float32Array(gw*gw), nb2=new Float32Array(gw*gw), nb3=new Float32Array(gw*gw);
  for(let gy=0;gy<gw;gy++)for(let gx=0;gx<gw;gx++){
    nb1[gy*gw+gx]=matSampleNoise(g1,8,gx*step/S,gy*step/S);
    nb2[gy*gw+gx]=matSampleNoise(g2,32,gx*step/S,gy*step/S);
    nb3[gy*gw+gx]=matSampleNoise(g3,96,gx*step/S,gy*step/S);
  }
  for(let y=0;y<S;y++){
    const y0=(y/step)|0, iy=y0>gw-2?gw-2:y0, fy=y/step-iy;
    const r1=iy*gw, r2=(iy+1)*gw;
    for(let x=0;x<S;x++){
      const x0=(x/step)|0, ix=x0>gw-2?gw-2:x0, fx=x/step-ix;
      const c1=r1+ix, c2=r2+ix;
      const a1=nb1[c1]+(nb1[c1+1]-nb1[c1])*fx, a2=nb1[c2]+(nb1[c2+1]-nb1[c2])*fx;
      const b1=nb2[c1]+(nb2[c1+1]-nb2[c1])*fx, b2=nb2[c2]+(nb2[c2+1]-nb2[c2])*fx;
      const d1=nb3[c1]+(nb3[c1+1]-nb3[c1])*fx, d2=nb3[c2]+(nb3[c2+1]-nb3[c2])*fx;
      const n=(a1+(a2-a1)*fy)*0.5 + (b1+(b2-b1)*fy)*0.3 + (d1+(d2-d1)*fy)*0.2;
      /* 草的斑驳：深浅绿交错，比单一绿色自然得多 */
      const patch=(rnd()-0.5)*30;
      const i=(y*S+x)<<2;
      const v0=0.68+n*0.62;
      d[i]  =Math.min(255, br*v0*0.92+patch*0.5);
      d[i+1]=Math.min(255, bg*v0+patch);
      d[i+2]=Math.min(255, bb*v0*0.86+patch*0.4);
      d[i+3]=255;
      hd[i]=hd[i+1]=hd[i+2]=128+(rnd()-0.5)*120; hd[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  hctx.putImageData(himg,0,0);
  /* 草叶：短小的斜线，远看就是"毛茸茸"的质感 */
  for(let k=0;k<2200;k++){
    const x=rnd()*S, y=rnd()*S, l=2+rnd()*5;
    ctx.strokeStyle='rgba('+Math.round(br*0.5)+','+Math.round(bg*0.75)+','+Math.round(bb*0.4)+','+(0.18+rnd()*0.3)+')';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(rnd()-0.5)*2, y-l); ctx.stroke();
  }
}

/* ---- 5. 木门 / 木牌 ---- */
function matDrawWood(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  ctx.fillStyle='rgb('+br+','+bg+','+bb+')';
  ctx.fillRect(0,0,S,S);
  hctx.fillStyle='rgb(140,140,140)'; hctx.fillRect(0,0,S,S);
  /* 木纹：一系列波浪线，频率和幅度都随机 */
  const planks=4, ph=S/planks;
  for(let p=0;p<planks;p++){
    const y0=p*ph;
    /* 每块板色调略不同 */
    const t=0.86+rnd()*0.28;
    ctx.fillStyle='rgb('+Math.round(br*t)+','+Math.round(bg*t)+','+Math.round(bb*t)+')';
    ctx.fillRect(0,y0,S,ph);
    /* 板缝 */
    ctx.fillStyle='rgba(0,0,0,.42)';
    ctx.fillRect(0,y0,S,2);
    hctx.fillStyle='rgba(0,0,0,.85)';
    hctx.fillRect(0,y0,S,3);
    /* 木纹线 */
    for(let k=0;k<26;k++){
      const y=y0+4+rnd()*(ph-8);
      ctx.strokeStyle='rgba(0,0,0,'+(0.04+rnd()*0.1)+')';
      ctx.lineWidth=0.6+rnd()*1.4;
      ctx.beginPath();
      let yy=y;
      ctx.moveTo(0,yy);
      for(let x=0;x<=S;x+=S/16){
        yy+=(rnd()-0.5)*4;
        ctx.lineTo(x,yy);
      }
      ctx.stroke();
    }
  }
}

/* ---- 6. 金属（路灯、栏杆、铁门）---- */
function matDrawMetal(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  ctx.fillStyle='rgb('+br+','+bg+','+bb+')';
  ctx.fillRect(0,0,S,S);
  hctx.fillStyle='rgb(128,128,128)'; hctx.fillRect(0,0,S,S);
  /* 竖向拉丝 */
  for(let k=0;k<420;k++){
    const x=rnd()*S;
    ctx.strokeStyle='rgba(255,255,255,'+(0.01+rnd()*0.05)+')';
    ctx.lineWidth=0.5+rnd();
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+(rnd()-0.5)*3,S); ctx.stroke();
  }
  /* 锈斑：铁锈是盐线世界观里很重要的质感 */
  for(let k=0;k<18;k++){
    const x=rnd()*S, y=rnd()*S, r=6+rnd()*26;
    const grd=ctx.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(122,58,24,'+(0.25+rnd()*0.3)+')');
    grd.addColorStop(1,'rgba(122,58,24,0)');
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
}

/* ---- 7. 瓷砖（走廊/室内）---- */
function matDrawTile(ctx, hctx, S, base, seed){
  const rnd=matRand(seed);
  const n=8, cs=S/n;
  const br=(base>>16)&255, bg=(base>>8)&255, bb=base&255;
  ctx.fillStyle='rgb('+Math.round(br*0.6)+','+Math.round(bg*0.6)+','+Math.round(bb*0.6)+')';
  ctx.fillRect(0,0,S,S);
  hctx.fillStyle='rgb(60,60,60)'; hctx.fillRect(0,0,S,S);
  for(let y=0;y<n;y++){
    for(let x=0;x<n;x++){
      const t=0.9+rnd()*0.2;
      ctx.fillStyle='rgb('+Math.min(255,Math.round(br*t))+','+Math.min(255,Math.round(bg*t))+','+Math.min(255,Math.round(bb*t))+')';
      ctx.fillRect(x*cs+2,y*cs+2,cs-4,cs-4);
      const hv=Math.round(200+rnd()*40);
      hctx.fillStyle='rgb('+hv+','+hv+','+hv+')';
      hctx.fillRect(x*cs+2,y*cs+2,cs-4,cs-4);
    }
  }
}

/* ============================================================
   材质注册表：颜色 → 材质参数
   场景里的几何体只传颜色，这里负责「这个颜色该长什么样」。
   这样 b_world.js 里几百个 box() 调用一行都不用改。
   ============================================================ */
const MAT_LIB={
  /* key: 材质名, 用于缓存 */
  concrete: {draw:matDrawConcrete, rough:.92, metal:0,   scale:2,  nrm:1.1},
  brick:    {draw:matDrawBrick,    rough:.95, metal:0,   scale:1.5,nrm:1.6},
  asphalt:  {draw:matDrawAsphalt,  rough:.97, metal:0,   scale:3,  nrm:.9},
  grass:    {draw:matDrawGrass,    rough:1,   metal:0,   scale:4,  nrm:.7},
  wood:     {draw:matDrawWood,     rough:.82, metal:0,   scale:1.2,nrm:1.2},
  metal:    {draw:matDrawMetal,    rough:.42, metal:.55, scale:1,  nrm:.6},
  tile:     {draw:matDrawTile,     rough:.55, metal:.05, scale:1.4,nrm:1.0},
};

/* 【颜色 → 材质的映射】
   原来是"统一混凝土"，但围墙、地面、草地应该长得不一样。
   这里按原始颜色的 RGB 特征做归类，不需要改调用点。

   【判定的坑（实测踩过）】
   - 中性灰必须按明度分三档，不能一股脑判成砖：
     0x555555 是路面深灰 → asphalt，0x8a8a8a/0x888888 是水泥灰 → concrete，
     0xc8cdd4 才是亮冷灰 → tile。
   - 窗户玻璃 0x88ccee 的 b 比 r 高很多，会被"灰蓝=砖"误捕；
     真正的砖是低彩度的灰蓝，彩度（max-min）不会超过 40。
   - 0x555 这种少写一位的写法也是深灰，不能因为短就漏判。 */
function matPick(color){
  const r=(color>>16)&255, g=(color>>8)&255, b=color&255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
  const sat=mx-mn;                     // 彩度：0 = 纯中性灰
  const lum=(r*299+g*587+b*114)/1000;  // 感知明度

  /* ① 高彩度且蓝占优 → 玻璃/天空蓝（窗户）。显式点名，避免被当成砖。 */
  if(sat>38 && b>r && b>g) return 'tile';
  /* 【贴图 bug #1：红色塑胶跑道被判成木头】
     跑道 0xa83528（r168 g53 b40 sat128 lum86）完全满足下面 wood 的条件，
     于是整圈 400 米跑道被贴上木纹，看着像一条木板路。
     区别在彩度：木头的 sat 一般在 24~80，而塑胶红冲到了 128。
     再看 g/b 比：棕色有梯度（约 1.1~1.5），纯红是 g≈b。
     命中就走 asphalt —— 沥青的颗粒绘制正好就是塑胶跑道的手感。 */
  {
    const gb = (g+1)/(b+1);
    if(sat>92 && r>g*1.5 && gb>0.75 && gb<1.55) return 'asphalt';
  }
  /* ② 木头必须是「暗」的红棕。
     【踩过的坑】一开始只写 `r>b*1.25 && sat>24`，
     结果 0xd9c6a3（教学楼米黄：r=217,g=198,b=163，sat=54）也被判成木头，
     整个主楼变成木板房。区别在于：木头是低亮度的棕，
     米黄是高明度的暖色。所以 wood 必须加 lum 上限。 */
  if(r>b*1.25 && r>g && sat>24 && lum<175) return 'wood';
  /* ③ 绿色明显高于红蓝 → 草地/树叶 */
  if(g>r*1.18 && g>b*1.18 && sat>18) return 'grass';
  /* ④ 中性灰按明度分档：这是最容易判错的一类 */
  /* 【贴图 bug #2：篮球场被判成水泥】
     篮球场底色 0x46545f 的 sat 正好是 25，被 24 这条线卡在外面，
     掉进第⑤条冷灰砖判定又因为 lum 不够而失败，最后落到 concrete。
     结果球场是一块水泥地，和操场的红跑道、绿草坪完全不搭。
     门限放到 26 让它进 asphalt（塑胶/沥青颗粒），
     其余实测颜色（0x8a9aa8 sat30 / 0xc8cdd4 sat12 / 0x5b6773 sat24）
     判定不变。 */
  if(sat<=26){
    if(lum<110) return 'asphalt';    // 深灰：路面、塑胶球场、深色金属柱
    if(lum<185) return 'concrete';   // 中灰：水泥、台阶、栏杆
    /* 【贴图 bug #3：纯白被判成瓷砖】
       lum>185 一律给 tile，于是球门柱、校门立柱、旗杆 0xffffff
       全成了 8x8 的卫生间瓷砖，小物件上看着像马赛克。
       纯白 / 近白应该是「白漆饰面」，走 concrete（有细颗粒但无格线）。 */
    if(lum>232) return 'concrete';
    return 'tile';                   // 亮灰：瓷砖、白漆墙裙
  }
  /* ⑤ 冷灰砖墙（围墙 0x8a9aa8 / 0x9aa3ab 这一类）。
     特征是「蓝>绿>红」的渐进冷调，彩度不算大但也不是纯中性灰。
     用相对关系判断，比卡死阈值稳：b 和 r 差 15~70，绿在中间偏高。
     这类不做砖会变成水泥，整圈围墙就失去砖砌的质感和缝隙层次。 */
  if(b>r && (b-r)>=15 && (b-r)<=72 && g>r && sat<=45 && lum>95 && lum<205) return 'brick';
  /* ⑥ 其余 → 混凝土（米黄教学楼 0xd9c6a3） */
  return 'concrete';
}

/* ---------- 纹理与材质缓存 ---------- */
const _matTexCache={};
const _matCache={};
/* 【纹理尺寸】512 会让 7 种材质合计约 1.9 秒（手机上更慢一截）。
   384 的计算量只有 512 的 56%，而在 3.5 米/次 的重复下，
   一块砖、一道砖缝的清晰度肉眼几乎分辨不出差别。
   这是「启动快」和「细节够」之间比较划算的一个取舍点。 */
/* 【贴图 bug #5：384 的尺寸把砖缝糊掉了】
   砖的绘制是「每块砖 + 2px 砖缝」，墙 unit=3.5 米一次重复 ——
   384px 覆盖 3.5 米 ⇒ 1 米只有 110px，一块 0.6 米宽的砖只有 66px，
   砖缝 2px 在缩小/斜视/低像素比下直接被滤掉，墙面就成了「一片糊的土黄」。
   实验室里看纹理好好的，进游戏一远看就没了 —— 这就是最典型的「贴图 bug」。
   512 让 1 米有 146px，砖缝能保留 3px；代价也只是单张生成从 ~45ms 到 ~80ms，
   7 种材质合计约 0.5 秒，只在 loading 付一次。 */
const MAT_TEX_SIZE=512;

function matTexOf(kind, color, variant){
  const key=kind+'|'+color+'|'+(variant||0);
  if(_matTexCache[key]) return _matTexCache[key];
  const def=MAT_LIB[kind]||MAT_LIB.concrete;
  const S=MAT_TEX_SIZE;
  const c=matCanvas(S), hc=matCanvas(S);
  const ctx=c.getContext('2d'), hctx=hc.getContext('2d');
  try{
    def.draw(ctx, hctx, S, color, (color^(variant||0))>>>0);
  }catch(e){
    /* 画崩了就退回纯色，绝不让一个纹理让整局游戏挂掉 */
    ctx.fillStyle='#'+('000000'+color.toString(16)).slice(-6);
    ctx.fillRect(0,0,S,S);
    hctx.fillStyle='rgb(128,128,128)';
    hctx.fillRect(0,0,S,S);
  }
  const rep=def.scale||1;
  const pack={
    map: matToTexture(c, rep),
    normalMap: matOrmToTexture ? matToTexture(matNormalFromHeight(hc, def.nrm||1), rep) : null,
    orm: matOrmToTexture(matOrmFromGray(hc, def.rough, def.metal), rep),
    rough: def.rough, metal: def.metal
  };
  /* 法线贴图必须线性空间，不能 sRGB */
  if(pack.normalMap && 'colorSpace' in pack.normalMap) pack.normalMap.colorSpace=THREE.NoColorSpace;
  _matTexCache[key]=pack;
  return pack;
}

/* 取一个 PBR 材质。repeat 是纹理在几何体上重复几次。
   【opts.plain=true】完全跳过贴图，退回纯色 —— 窗户玻璃、撤离点光环、
   任何 transparent/emissive 的装饰面都走这条路，否则会被 matPick 误判成
   砖或草地，玻璃上出现砖缝，光环上出现碎石。 */
function matGet(color, opts){
  opts=opts||{};
  if(opts.plain){
    return new THREE.MeshStandardMaterial({
      color:color,
      roughness:opts.rough!==undefined?opts.rough:.85,
      transparent:!!opts.transparent,
      opacity:opts.opacity!==undefined?opts.opacity:1,
      emissive:opts.emissive||0x000000,
      emissiveIntensity:opts.emissiveIntensity!==undefined?opts.emissiveIntensity:1,
      side:opts.side||THREE.FrontSide
    });
  }
  const kind=opts.kind || matPick(color);
  /* 【贴图 bug #4：纵横共用同一个 repeat，墙砖被压扁】
     原来 matGetForSize 算出 rx/ry 之后取了 max 当共同值：
     一面 60 米宽 × 14 米高的墙，rx=17、ry=4，取 17 ——
     于是垂直方向也铺了 17 遍，每遍只剩 0.82 米高。
     砖的横缝在纵向被压缩到原来的 1/4，远看是一层层「细横条」，
     走近是一排被拉长的扁砖。地面、路面、屋顶全有同样问题。
     现在 rep 允许传 [rx, ry] 数组，横纵分开铺。
     兼容旧调用：仍然是数字的时候两根轴同值。 */
  const repIn=opts.repeat!==undefined?opts.repeat:(MAT_LIB[kind]||MAT_LIB.concrete).scale;
  const repX=Array.isArray(repIn)?repIn[0]:repIn;
  const repY=Array.isArray(repIn)?repIn[1]:repIn;
  const rep=repX+'x'+repY;
  const key=kind+'|'+color+'|'+rep+'|'+(opts.transparent?1:0)+'|'+(opts.opacity!==undefined?opts.opacity:1)+'|'+(opts.emissive||0);
  if(_matCache[key]) return _matCache[key];
const tex=matTexOf(kind, color, 0);
  /* 【必须 clone 纹理】
     tex.map / tex.normalMap / tex.orm 存在 _matTexCache 里，是全图共享的同一份。
     同一个 kind+color 会被很多不同尺寸的物体用到：
     60 米的主楼墙要 repeat=17，2 米的小牌子要 repeat=1。
     如果直接在共享纹理上调 repeat.set()，后建的会覆盖先建的，
     结果就是「有的墙纹理被拉成马赛克、有的密成噪点」，而且随加载顺序变化。
     所以这里 clone 出属于这个材质自己的纹理副本，
     像素数据仍然共享（clone 不复制 image），内存代价可忽略。 */
  const own=(t)=>{
    if(!t) return null;
    const c=t.clone();
    c.needsUpdate=true;
    return c;
  };
  const mapT=own(tex.map), nrmT=own(tex.normalMap), ormT=own(tex.orm);
  const params={
    color: 0xffffff,     // 【关键】贴图自带颜色，材质色必须是白，否则会二次染色变暗
    map: mapT,
    normalMap: nrmT,
    roughnessMap: ormT,
    metalnessMap: ormT,
    roughness: tex.rough,
    metalness: tex.metal,
  };
  if(nrmT) params.normalScale=new THREE.Vector2(1,1);
  if(opts.transparent){ params.transparent=true; params.opacity=opts.opacity!==undefined?opts.opacity:1; }
  if(opts.emissive){
    params.emissive=opts.emissive;
    params.emissiveIntensity=opts.emissiveIntensity!==undefined?opts.emissiveIntensity:0.6;
  }
  let m;
  try{
    m=new THREE.MeshStandardMaterial(params);
  }catch(e){
    /* 极老设备不支持某些字段就退回纯色 */
    m=new THREE.MeshStandardMaterial({color:color, roughness:.9});
  }
  /* 贴合几何体尺寸调整 UV 重复（每份纹理都是自己的副本，互不影响） */
  if(mapT) mapT.repeat.set(repX, repY);
  if(nrmT) nrmT.repeat.set(repX, repY);
  if(ormT) ormT.repeat.set(repX, repY);
  m.name=key;
  _matCache[key]=m;
  return m;
}
/* 按几何体实际尺寸算纹理重复次数：
   目标 = 每 repeatUnit 米重复一次纹理。这样无论物体多大，
   纹理密度都一致（这对 60 米宽的教学楼尤其重要）。 */
function matGetForSize(color, w, h, d, opts){
  const o=opts||{};
  const unit=o.unit||3.5;   // 3.5 米一次纹理
  const kind=o.kind||matPick(color);
  /* 【横纵分开算】见 matGet 里第 4 条说明。
     原来 `const rep=Math.max(rx,ry)` 让宽墙的砖被压扁：
     60×14 的墙 rx=17 / ry=4，取 17 之后纵向每 0.82 米就重复一次。
     现在分别按「横向跨度」和「纵向跨度」算两个重复数：
       60×14 的墙 → [17, 4]；3×3 的柱子 → [1, 1]（小物件不铺碎花）。
     【平铺面特判】groundDeco 用 PlaneGeometry(w,d) 且调用时传 h=1，
     它是躺在 XZ 平面上的 —— 贴图的 v 方向走的是 d（深度），不是高度。
     如果按 h 算 ry 会永远是 1，整条跑道只有一次纵向重复、
     被拉成一条超长的横纹。所以「h 很小而 d 明显更大」时按平面处理。 */
  /* 【平铺面判定不能用绝对阈值】groundDeco 传的是 h=1（占位），
     写死 h<=0.5 的话它永远是 false，ry 变成 1/3.5 → clamp 到 1，
     整条 64 米长的跑道只有一次纵向重复、被拉成一条超长横纹。
     改成相对判断：厚度不足「长边的 15%」就算平铺，v 方向跟纵深走。
       跑道 96×1×64 → 1 <= 9.6 ✓ 平铺
       地板 58×0.1×14 → 0.1 <= 2.1 ✓ 平铺
       墙 60×14×1 → 14 <= 0.15 ✗ 不是平铺
       柱 0.3×4.5×0.3 → 4.5 <= 0.045 ✗ 不是平铺 */
  const flat = (h <= Math.max(0.5, Math.max(w,d)*0.15));
  let rx=Math.max(w,d)/unit;
  let ry=(flat ? d : h)/unit;
  rx=Math.max(1,Math.min(24,Math.round(rx*2)/2));
  ry=Math.max(1,Math.min(24,Math.round(ry*2)/2));
  return matGet(color, {kind:kind, repeat:[rx,ry], transparent:o.transparent, opacity:o.opacity, emissive:o.emissive, plain:o.plain, rough:o.rough, emissiveIntensity:o.emissiveIntensity, side:o.side});
}
