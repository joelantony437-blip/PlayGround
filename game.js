(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mapCanvas = document.getElementById('minimap');
  const mctx = mapCanvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const WORLD = { w: 2600, h: 1900 };
  const thresholds = [12, 42, 115, 285, 650, 1300];
  const stages = ['SPORELING', 'DRIFTER', 'GRAZER', 'STALKER', 'COLOSSUS', 'APEX'];
  const stageColors = ['#a8ee79', '#72e5b3', '#61d8cc', '#84c8ed', '#c296ed', '#ffbd71'];
  const names = ['Mossback', 'Glimmer', 'Bramble', 'Murk', 'Velvet', 'Needle', 'Morrow', 'Pip', 'Lantern', 'Wisp', 'Thorn', 'Mica', 'Gutter'];
  const foodColors = ['#c5f47e', '#81e8c1', '#edcc77', '#ff9e7b', '#a4a4ff'];
  const mutationPool = [
    {id:'spines', icon:'✳', name:'BARBED MEMBRANE', tag:'OFFENSE', desc:'Grow defensive spikes. Deal damage when a larger predator collides with you.', apply:p=>p.spines++},
    {id:'swift', icon:'➤', name:'PULSE MUSCLE', tag:'MOBILITY', desc:'A stronger burst and quicker recovery. Your prey will have nowhere to run.', apply:p=>{p.speedBoost+=.1;p.dashBoost+=.25}},
    {id:'siphon', icon:'◉', name:'NUTRIENT SIPHON', tag:'METABOLISM', desc:'Absorb more from every spore and creature you consume.', apply:p=>p.feedBoost+=.22},
    {id:'armor', icon:'⬡', name:'HARDENED CYST', tag:'DEFENSE', desc:'A dense shell lets you survive a predator strike and escape.', apply:p=>p.armor++},
    {id:'sense', icon:'◎', name:'CHEMORECEPTORS', tag:'SENSORY', desc:'Sense nearby life. The map reveals creatures beyond your sight.', apply:p=>p.sense++},
    {id:'lure', icon:'✧', name:'LUMINOUS LURE', tag:'ADAPTATION', desc:'Your glow attracts nutrient-rich spores from farther away.', apply:p=>p.lure++},
    {id:'toxin', icon:'☄', name:'TOXIN VESICLES', tag:'OFFENSE', desc:'A toxic wake slows creatures that try to chase you.', apply:p=>p.toxin++},
    {id:'scavenge', icon:'⌁', name:'RAPID DIGESTION', tag:'METABOLISM', desc:'Turn biomass into growth faster, with a small bonus to movement.', apply:p=>{p.feedBoost+=.12;p.speedBoost+=.04}}
  ];
  let W=innerWidth,H=innerHeight,dpr=1,last=0,gameStarted=false,paused=false,dead=false,mutating=false,elapsed=0,kills=0,best=0,shake=0,toastTimer=0;
  let camera={x:WORLD.w/2,y:WORLD.h/2},foods=[],bots=[],particles=[],keys={},pointer={x:0,y:0,active:false},touchVec={x:0,y:0},audioCtx=null,muted=true;
  const player={x:WORLD.w/2,y:WORLD.h/2,mass:12,r:17,angle:0,speedBoost:0,dashBoost:0,feedBoost:0,spines:0,armor:0,sense:0,lure:0,toxin:0,energy:100,invuln:0,level:0,mutations:[],dashFlash:0};
  best=Number(localStorage.getItem('primordia-best')||0);
  $('best-value').textContent=best?`${Math.floor(best)}g`:'—';
  const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize);resize();
  function randPoint(pad=100){return {x:rand(pad,WORLD.w-pad),y:rand(pad,WORLD.h-pad)}}
  function makeFood(pos){let p=pos||randPoint(35);return {x:p.x,y:p.y,r:rand(3.2,5.4),color:foodColors[(Math.random()*foodColors.length)|0],phase:rand(0,6.3),value:rand(1.7,3.8)}}
  function makeBot(i,pos){let p=pos||randPoint(180);let mass=rand(9,115);return {x:p.x,y:p.y,mass,r:radius(mass),name:names[i%names.length],hue:rand(0,360),angle:rand(0,6.28),vx:0,vy:0,wander:rand(0,3),think:rand(.2,2),mode:'wander',dead:false}}
  function makeSafeBot(i,minDistance=480){let b=makeBot(i),tries=0;while(dist(b,player)<minDistance&&tries++<40)b=makeBot(i);return b}
  function radius(m){return 9+Math.pow(Math.max(1,m),.47)*2.0}
  for(let i=0;i<180;i++)foods.push(makeFood());
  for(let i=0;i<15;i++)bots.push(makeBot(i));
  player.r=radius(player.mass);
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');toastTimer=2.2}
  function playTone(freq=440,dur=.08,type='sine'){if(muted)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}catch(_){}}
  function fx(x,y,color,n=8,power=90){for(let i=0;i<n;i++){let a=rand(0,Math.PI*2),s=rand(power*.25,power);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.3,.85),max:.85,r:rand(1.5,4),color})}}
  function addMass(amount){player.mass=Math.max(1,player.mass+amount);player.r=radius(player.mass);checkGrowth();}
  function stageFor(m){let n=0;while(n<thresholds.length-1&&m>=thresholds[n+1])n++;return n}
  function checkGrowth(){let newStage=stageFor(player.mass);if(newStage>player.level){player.level=newStage;$('stage-name').textContent=stages[newStage];$('biome-label').textContent=['THE VERDANT','THE SHALLOWS','THE MYCELIUM','THE UMBRAL','THE DEEP','THE CROWN'][newStage];$('evolution-name').textContent=stages[newStage]+' FORM';const f=$('evolution-flash');f.classList.remove('show');void f.offsetWidth;f.classList.add('show');showToast(`EVOLUTION COMPLETE · ${stages[newStage]}`);fx(player.x,player.y,stageColors[newStage],36,170);playTone(480,.35,'triangle')}
    let next=mutationMilestones.find(x=>player.mass>=x&&!player.mutations.includes(x));if(next&&!mutating){player.mutations.push(next);openMutation()}}
  const mutationMilestones=[28,90,220,500,1050];
  function openMutation(){mutating=true;paused=true;const options=[...mutationPool].sort(()=>Math.random()-.5).slice(0,3);const box=$('mutation-options');box.innerHTML='';options.forEach((m,i)=>{const card=document.createElement('button');card.className='mutation-option';card.innerHTML=`<span class="mut-tag">${m.tag}</span><span class="mut-icon">${m.icon}</span><h3>${m.name}</h3><p>${m.desc}</p>`;card.addEventListener('click',()=>{m.apply(player);player.mutations.push(m.id);$('mutation').classList.add('hidden');mutating=false;paused=false;showToast(`ADAPTATION INSTALLED · ${m.name}`);fx(player.x,player.y,'#b6f36b',22,120);playTone(620,.2,'triangle')});box.appendChild(card)});$('mutation').classList.remove('hidden')}
  function startGame(){gameStarted=true;dead=false;paused=false;mutating=false;elapsed=0;kills=0;player.x=WORLD.w/2;player.y=WORLD.h/2;player.mass=12;player.r=radius(12);player.angle=0;player.speedBoost=0;player.dashBoost=0;player.feedBoost=0;player.spines=0;player.armor=0;player.sense=0;player.lure=0;player.toxin=0;player.energy=100;player.invuln=4;player.level=0;player.mutations=[];player.dashFlash=0;pointer.active=false;bots=[];foods=[];particles=[];for(let i=0;i<190;i++)foods.push(makeFood());for(let i=0;i<15;i++)bots.push(makeSafeBot(i,500));$('welcome').classList.add('hidden');$('gameover').classList.add('hidden');$('mutation').classList.add('hidden');$('stage-name').textContent=stages[0];$('stage-count').textContent='01';$('next-stage').textContent='02';$('kills-value').textContent='00';$('biome-label').textContent='THE VERDANT';$('objective-title').textContent='THE FOOD CHAIN';$('objective-copy').textContent='Consume drifting spores. Hunt anything smaller.';updateHud();showToast('BIOSPHERE STABLE · FIND YOUR FIRST MEAL')}
  function endGame(){dead=true;paused=true;gameStarted=false;fx(player.x,player.y,stageColors[player.level],28,160);$('end-mass').textContent=`${Math.floor(player.mass)}g`;$('end-stage').textContent=stages[player.level];$('end-kills').textContent=kills;$('death-copy').textContent=kills?`You consumed ${kills} creature${kills===1?'':'s'} before the food chain closed in.`:'Every ending feeds a beginning.';let b=Math.max(best,Math.floor(player.mass));if(b>best){best=b;localStorage.setItem('primordia-best',best)}$('best-value').textContent=best?`${best}g`:'—';$('gameover').classList.remove('hidden');playTone(110,.4,'sawtooth')}
  function dash(){if(!gameStarted||paused||player.energy<28)return;let dx=0,dy=0;if(keys.w||keys.ArrowUp)dy--;if(keys.s||keys.ArrowDown)dy++;if(keys.a||keys.ArrowLeft)dx--;if(keys.d||keys.ArrowRight)dx++;if(touchVec.x||touchVec.y){dx=touchVec.x;dy=touchVec.y}if(!dx&&!dy){dx=Math.cos(player.angle);dy=Math.sin(player.angle)}let l=Math.hypot(dx,dy)||1;player.vx=dx/l;player.vy=dy/l;player.energy-=28;player.dashFlash=.28;player.invuln=Math.max(player.invuln,.22);fx(player.x,player.y,'#a9f47b',10,130);playTone(230,.13,'sawtooth')}
  $('start-btn').addEventListener('click',startGame);$('retry-btn').addEventListener('click',startGame);$('dash-touch').addEventListener('pointerdown',e=>{e.preventDefault();dash()});$('sound-btn').addEventListener('click',()=>{$('sound-btn').classList.toggle('active');muted=!muted;$('sound-btn').textContent=muted?'♫':'♪';if(!muted)playTone(440,.1)});
  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys[e.key]=true;if(e.key===' '&&!e.repeat)dash();if(e.key==='Enter'&&!gameStarted&&!dead)startGame();if(e.key==='Escape'&&gameStarted&&!mutating){paused=!paused;showToast(paused?'SIMULATION PAUSED':'SIMULATION RESUMED')}});addEventListener('keyup',e=>keys[e.key]=false);
  canvas.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true});canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true}});
  const stick=$('stick');let stickPointer=null;stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e)});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e)});function updateStick(e){let r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),l=Math.hypot(dx,dy),max=35;if(l>max){dx*=max/l;dy*=max/l}touchVec={x:dx/max,y:dy/max};stick.firstElementChild.style.transform=`translate(${dx}px,${dy}px)`}function endStick(e){if(e.pointerId===stickPointer){stickPointer=null;touchVec={x:0,y:0};stick.firstElementChild.style.transform=''}}stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  function steer(dt){let dx=0,dy=0;if(keys.w||keys.ArrowUp)dy--;if(keys.s||keys.ArrowDown)dy++;if(keys.a||keys.ArrowLeft)dx--;if(keys.d||keys.ArrowRight)dx++;if(touchVec.x||touchVec.y){dx=touchVec.x;dy=touchVec.y}else if(!dx&&!dy&&pointer.active&&gameStarted){dx=pointer.x-W/2;dy=pointer.y-H/2;if(Math.hypot(dx,dy)<20){dx=0;dy=0}}
    let len=Math.hypot(dx,dy);if(len>0){dx/=len;dy/=len;player.angle=Math.atan2(dy,dx)}else if(player.dashFlash<=0){dx=0;dy=0}
    let maxSpeed=(176/Math.pow(Math.max(1,player.mass/12),.12))*(1+player.speedBoost);if(player.dashFlash>0){player.x+=player.vx*maxSpeed*3.1*dt;player.y+=player.vy*maxSpeed*3.1*dt;player.dashFlash-=dt}else{player.x+=dx*maxSpeed*dt;player.y+=dy*maxSpeed*dt}
    player.x=clamp(player.x,player.r,WORLD.w-player.r);player.y=clamp(player.y,player.r,WORLD.h-player.r);if(player.invuln>0)player.invuln-=dt;player.energy=clamp(player.energy+dt*(10+player.dashBoost*5),0,100);
  }
  function updateBots(dt){for(const b of bots){b.think-=dt;if(b.think<=0){b.think=rand(.5,1.8);const d=dist(b,player),playerCanEat=player.mass>b.mass*1.14,botCanEat=b.mass>player.mass*1.16;if(d<470){if(playerCanEat){b.mode='flee';b.target=player}else if(botCanEat&&d<390){b.mode='hunt';b.target=player}else b.mode='wander'}else b.mode='wander';if(b.mode==='wander')b.wander=rand(0,6.28)}
      let tx=b.mode==='wander'?Math.cos(b.wander):((b.mode==='flee'?-1:1)*(player.x-b.x)),ty=b.mode==='wander'?Math.sin(b.wander):((b.mode==='flee'?-1:1)*(player.y-b.y));let ll=Math.hypot(tx,ty)||1;tx/=ll;ty/=ll;let pace=72/Math.pow(Math.max(.8,b.mass/20),.12);if(b.mode==='hunt')pace*=1.14;b.x+=tx*pace*dt;b.y+=ty*pace*dt;b.angle=Math.atan2(ty,tx);b.x=clamp(b.x,b.r,WORLD.w-b.r);b.y=clamp(b.y,b.r,WORLD.h-b.r);
      if(b.mode==='wander'){let nearest=null,nd=130;for(const f of foods){let d=dist(b,f);if(d<nd){nearest=f;nd=d}}if(nearest&&nd<b.r+nearest.r){foods.splice(foods.indexOf(nearest),1);foods.push(makeFood());b.mass+=nearest.value*.7;b.r=radius(b.mass)}}
      let d=dist(b,player);if(d<b.r+player.r*.82){if(player.mass>b.mass*1.12){player.mass+=b.mass*.68*(1+player.feedBoost);player.r=radius(player.mass);kills++;$('kills-value').textContent=String(kills).padStart(2,'0');fx(b.x,b.y,`hsl(${b.hue} 75% 65%)`,18,130);showToast(`${b.name.toUpperCase()} CONSUMED · +${Math.round(b.mass*.68)}g`);playTone(310,.12,'triangle');let i=bots.indexOf(b);bots[i]=makeSafeBot((Math.random()*names.length)|0,460);checkGrowth()}
        else if(b.mass>player.mass*1.16&&player.invuln<=0){if(player.spines>0){b.mass*=.82;b.r=radius(b.mass);fx(player.x,player.y,'#b6f36b',8,80);player.invuln=.9;showToast('SPIKES DEFLECTED PREDATOR')}else if(player.armor>0){player.armor--;player.invuln=2;addMass(-Math.min(player.mass*.18,25));fx(player.x,player.y,'#76eed2',15,120);showToast('CYST SHATTERED · ESCAPE')}else if(player.mass>24){addMass(-Math.min(player.mass*.31,55));player.invuln=2.2;player.x=clamp(player.x+(player.x-b.x)*.8,player.r,WORLD.w-player.r);player.y=clamp(player.y+(player.y-b.y)*.8,player.r,WORLD.h-player.r);fx(player.x,player.y,'#ff987b',15,150);showToast('PREDATOR STRIKE · GET AWAY');shake=8}else{endGame();return}}
      }
    }}
  function update(dt){if(!gameStarted||paused)return;elapsed+=dt;steer(dt);updateBots(dt);if(dead)return;
    for(let i=foods.length-1;i>=0;i--){let f=foods[i];let d=dist(player,f);if(d<player.r+f.r+((player.lure)?15:0)){foods.splice(i,1);foods.push(makeFood());addMass(f.value*(1+player.feedBoost));fx(f.x,f.y,f.color,5,50);if(Math.random()<.17)playTone(rand(500,800),.035,'sine')}}
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt}particles=particles.filter(p=>p.life>0);
    if(foods.length<170)foods.push(makeFood());camera.x+=(player.x-camera.x)*Math.min(1,dt*4);camera.y+=(player.y-camera.y)*Math.min(1,dt*4);if(shake>0)shake=Math.max(0,shake-dt*20);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show')}
    updateHud();
  }
  function updateHud(){const stage=stageFor(player.mass),start=thresholds[stage],end=thresholds[Math.min(stage+1,thresholds.length-1)],pct=stage===thresholds.length-1?100:clamp((player.mass-start)/(end-start)*100,0,100);$('mass-value').textContent=Math.floor(player.mass);$('stage-name').textContent=stages[stage];$('stage-count').textContent=String(stage+1).padStart(2,'0');$('next-stage').textContent=String(Math.min(stage+2,stages.length)).padStart(2,'0');$('mass-progress').style.width=pct+'%';$('stage-progress').style.width=pct+'%';$('burst-meter').style.width=player.energy+'%';$('burst-status').textContent=player.energy>=28?'READY':'RECHARGING';$('time-value').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
    const ranks=[{name:'YOU',mass:player.mass,you:true},...bots.map(b=>({name:b.name,mass:b.mass}))].sort((a,b)=>b.mass-a.mass).slice(0,5);$('leader-list').innerHTML=ranks.map((r,i)=>`<li class="${r.you?'me':''}"><span>${String(i+1).padStart(2,'0')} &nbsp; ${r.name}</span><span>${Math.floor(r.mass)}g</span></li>`).join('');
    const target=player.mass<42?'THE FOOD CHAIN':player.mass<115?'THE HUNT':'APEX INSTINCT';$('objective-title').textContent=target;$('objective-copy').textContent=player.mass<42?'Consume drifting spores. Hunt anything smaller.':player.mass<115?'You have teeth now. Find prey smaller than you.':'Nothing in this biome is beyond your reach.';
  }
  function worldToScreen(x,y){return {x:x-camera.x+W/2,y:y-camera.y+H/2}}
  function drawBackground(){ctx.fillStyle='#0c211f';ctx.fillRect(0,0,W,H);const ox=W/2-camera.x,oy=H/2-camera.y;ctx.save();ctx.translate(ox,oy);
    // Seamless bioluminescent lattice
    let step=72;ctx.lineWidth=1;for(let x=Math.floor(camera.x-W/2)/step*step;x<camera.x+W/2+step;x+=step){for(let y=Math.floor(camera.y-H/2)/step*step;y<camera.y+H/2+step;y+=step){let sx=x+Math.sin(y*.006)*8,sy=y+Math.sin(x*.007)*8;ctx.strokeStyle=((Math.floor(x/step)+Math.floor(y/step))%5===0)?'rgba(127,203,157,.065)':'rgba(139,198,163,.026)';ctx.beginPath();ctx.moveTo(sx-8,sy);ctx.quadraticCurveTo(sx,sy+Math.sin((x+y)*.008)*5,sx+8,sy+2);ctx.stroke();if((Math.floor(x/step)*7+Math.floor(y/step)*13)%19===0){ctx.fillStyle='rgba(154,218,156,.12)';ctx.beginPath();ctx.arc(sx,sy,1.2,0,Math.PI*2);ctx.fill()}}}
    ctx.strokeStyle='rgba(155,226,177,.15)';ctx.lineWidth=3;ctx.strokeRect(0,0,WORLD.w,WORLD.h);ctx.restore();
  }
  function drawCell(o,isPlayer=false){const s=worldToScreen(o.x,o.y);if(s.x<-o.r*3||s.x>W+o.r*3||s.y<-o.r*3||s.y>H+o.r*3)return;let r=o.r;
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(isPlayer?player.angle:o.angle||0);const hue=isPlayer?148:o.hue;let base=isPlayer?stageColors[player.level]:`hsl(${hue} 60% 61%)`;
    if(isPlayer&&player.invuln>0&&Math.floor(performance.now()/90)%2===0)ctx.globalAlpha=.58;
    // soft outer aura
    let glow=ctx.createRadialGradient(0,0,r*.2,0,0,r*2.15);glow.addColorStop(0,isPlayer?'rgba(152,238,116,.22)':`hsla(${hue},70%,65%,.18)`);glow.addColorStop(1,'rgba(40,130,130,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*2.15,0,Math.PI*2);ctx.fill();
    if(isPlayer&&player.spines){ctx.strokeStyle='#c9f39b';ctx.lineWidth=2;for(let i=0;i<Math.min(12,player.spines*4);i++){let a=i/Math.min(12,player.spines*4)*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.82,Math.sin(a)*r*.82);ctx.lineTo(Math.cos(a)*(r+8+player.spines),Math.sin(a)*(r+8+player.spines));ctx.stroke()}}
    let grad=ctx.createRadialGradient(-r*.34,-r*.4,r*.05,0,0,r*1.25);grad.addColorStop(0,isPlayer?'#e4ffb1':`hsl(${hue} 75% 82%)`);grad.addColorStop(.24,base);grad.addColorStop(.72,isPlayer?'#398e79':`hsl(${hue} 52% 38%)`);grad.addColorStop(1,'#102b35');
    ctx.fillStyle=grad;ctx.beginPath();for(let i=0;i<=36;i++){let a=i/36*Math.PI*2,wiggle=1+Math.sin(a*5+(performance.now()*.001)+(o.wander||0))*0.045+Math.sin(a*8)*.025,rr=r*wiggle;let x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill();ctx.strokeStyle=isPlayer?'rgba(226,255,190,.65)':`hsla(${hue},80%,85%,.32)`;ctx.lineWidth=Math.max(1,r*.045);ctx.stroke();
    // nucleus and eyes
    let nr=Math.max(3,r*.25);ctx.fillStyle=isPlayer?'#426a83':`hsl(${(hue+80)%360} 44% 34%)`;ctx.beginPath();ctx.ellipse(-r*.08,0,nr*1.02,nr*.8,-.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(214,255,218,.35)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#efffd4';ctx.beginPath();ctx.arc(r*.3,-r*.18,Math.max(1.8,r*.09),0,Math.PI*2);ctx.fill();ctx.fillStyle='#132526';ctx.beginPath();ctx.arc(r*.33,-r*.18,Math.max(1,r*.045),0,Math.PI*2);ctx.fill();
    if(isPlayer&&player.lure){ctx.strokeStyle='rgba(200,255,127,.23)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r+8+Math.sin(performance.now()*.004)*2,0,Math.PI*2);ctx.stroke()}
    ctx.restore();if(!isPlayer&&r>18){ctx.fillStyle='rgba(226,239,226,.74)';ctx.font=`${Math.max(9,Math.min(11,r*.34))}px "DM Mono", monospace`;ctx.textAlign='center';ctx.fillText(o.name,s.x,s.y-r-8)}
  }
  function draw(){drawBackground();const t=performance.now()*.001;
    for(const f of foods){const s=worldToScreen(f.x,f.y),r=f.r+Math.sin(t*2+f.phase)*.7;if(s.x<-12||s.x>W+12||s.y<-12||s.y>H+12)continue;ctx.fillStyle=f.color;ctx.globalAlpha=.72;ctx.shadowColor=f.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1}
    for(const b of bots)drawCell(b,false);drawCell(player,true);
    for(const p of particles){let s=worldToScreen(p.x,p.y);ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,s.y,p.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
    // minimap
    mctx.clearRect(0,0,mapCanvas.width,mapCanvas.height);mctx.fillStyle='#0d2522';mctx.fillRect(0,0,mapCanvas.width,mapCanvas.height);mctx.strokeStyle='rgba(155,226,177,.16)';mctx.strokeRect(.5,.5,mapCanvas.width-1,mapCanvas.height-1);for(const b of bots){mctx.fillStyle=b.mass>player.mass?'#ef9376':'#8ca8ec';mctx.beginPath();mctx.arc(b.x/WORLD.w*mapCanvas.width,b.y/WORLD.h*mapCanvas.height,1.8,0,Math.PI*2);mctx.fill()}mctx.fillStyle='#c5f47e';mctx.shadowColor='#c5f47e';mctx.shadowBlur=7;mctx.beginPath();mctx.arc(player.x/WORLD.w*mapCanvas.width,player.y/WORLD.h*mapCanvas.height,3,0,Math.PI*2);mctx.fill();mctx.shadowBlur=0;
  }
  function frame(now){let dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
})();
