import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const ctx = canvas.getContext('2d')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const score = document.querySelector<HTMLDivElement>('#score')!;
const redSelect = document.querySelector<HTMLSelectElement>('#red-select')!;
const blueSelect = document.querySelector<HTMLSelectElement>('#blue-select')!;
const redFlag = document.querySelector<HTMLSpanElement>('#red-flag')!;
const blueFlag = document.querySelector<HTMLSpanElement>('#blue-flag')!;
const redName = document.querySelector<HTMLElement>('#red-name')!;
const blueName = document.querySelector<HTMLElement>('#blue-name')!;

const COUNTRIES = [
  ['IN','🇮🇳','INDIA'],['US','🇺🇸','USA'],['BR','🇧🇷','BRAZIL'],['JP','🇯🇵','JAPAN'],
  ['GB','🇬🇧','UK'],['DE','🇩🇪','GERMANY'],['FR','🇫🇷','FRANCE'],['IT','🇮🇹','ITALY'],
  ['CA','🇨🇦','CANADA'],['AU','🇦🇺','AUSTRALIA'],['MX','🇲🇽','MEXICO'],['AR','🇦🇷','ARGENTINA'],
] as const;
for (const [code,,name] of COUNTRIES) { redSelect.add(new Option(name,code)); blueSelect.add(new Option(name,code)); }
redSelect.value='IN'; blueSelect.value='US';

const TAU=Math.PI*2, GRAVITY=185, BOUNCE=.94, BALL_RADIUS=25, MAX_SPEED=760, ROUND_SECONDS=30, FIXED_DT=1/120;
let width=400,height=700,dpr=1,centerX=200,centerY=360,arenaRadius=160,running=false,elapsed=0,accumulator=0,lastTime=performance.now(),redWins=0,blueWins=0;

class Music {
  private ac: AudioContext | undefined;
  private master: GainNode | undefined;
  private timer: number | undefined;
  private step=0;
  start(): void {
    if (!this.ac) { this.ac=new AudioContext(); this.master=this.ac.createGain(); this.master.gain.value=.045; this.master.connect(this.ac.destination); }
    void this.ac.resume(); if (this.timer !== undefined) return; this.schedule();
  }
  stop(): void { if (this.timer !== undefined) { window.clearTimeout(this.timer); this.timer=undefined; } }
  private schedule(): void {
    if (!this.ac || !this.master) return;
    const notes=[220,277.18,329.63,440,329.63,277.18,246.94,329.63]; const f=notes[this.step++%notes.length]!;
    const o=this.ac.createOscillator(), g=this.ac.createGain(); o.type='triangle'; o.frequency.value=f; g.gain.setValueAtTime(.0001,this.ac.currentTime); g.gain.exponentialRampToValueAtTime(.45,this.ac.currentTime+.015); g.gain.exponentialRampToValueAtTime(.0001,this.ac.currentTime+.28); o.connect(g); g.connect(this.master); o.start(); o.stop(this.ac.currentTime+.3);
    this.timer=window.setTimeout(()=>this.schedule(),360);
  }
  hit(strength=1): void { if(!this.ac||!this.master)return; const o=this.ac.createOscillator(),g=this.ac.createGain(); o.type='sine';o.frequency.value=100+strength*180;g.gain.value=.08;g.gain.exponentialRampToValueAtTime(.0001,this.ac.currentTime+.12);o.connect(g);g.connect(this.master);o.start();o.stop(this.ac.currentTime+.13); }
}
const music=new Music();

class CountryBall {
  x=0;y=0;vx=0;vy=0;angle=0;spin=0;trail:{x:number;y:number}[]=[];
  constructor(public readonly team:'red'|'blue'){}
  reset(x:number,y:number){this.x=x;this.y=y;this.vx=(Math.random()*2-1)*220;this.vy=(Math.random()*2-1)*220;this.angle=Math.random()*TAU;this.spin=(Math.random()*2-1)*2;this.trail=[];}
  update(dt:number){this.vy+=GRAVITY*dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.angle+=this.spin*dt;this.spin*=Math.pow(.72,dt);const dx=this.x-centerX,dy=this.y-centerY,d=Math.hypot(dx,dy)||.0001,max=arenaRadius-BALL_RADIUS;if(d>max){const nx=dx/d,ny=dy/d,dot=this.vx*nx+this.vy*ny;this.x=centerX+nx*max;this.y=centerY+ny*max;if(dot>0){this.vx-=(1+BOUNCE)*dot*nx;this.vy-=(1+BOUNCE)*dot*ny;this.spin+=(this.vx*ny-this.vy*nx)*.003;music.hit(Math.min(1,Math.abs(dot)/500));}}const s=Math.hypot(this.vx,this.vy);if(s>MAX_SPEED){const k=MAX_SPEED/s;this.vx*=k;this.vy*=k;}this.trail.push({x:this.x,y:this.y});if(this.trail.length>10)this.trail.shift();}
}
const red=new CountryBall('red'),blue=new CountryBall('blue');

function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);centerX=width/2;centerY=height*.49;arenaRadius=Math.min(width*.43,height*.36,215);resetBalls();}
function resetBalls(){const s=Math.max(70,arenaRadius*.55);red.reset(centerX-s,centerY-4);blue.reset(centerX+s,centerY-4);}
function collideBalls(){let dx=blue.x-red.x,dy=blue.y-red.y,d=Math.hypot(dx,dy);if(!d){dx=1;dy=0;d=1;}const min=BALL_RADIUS*2;if(d>=min)return;const nx=dx/d,ny=dy/d,overlap=min-d;red.x-=nx*overlap*.5;red.y-=ny*overlap*.5;blue.x+=nx*overlap*.5;blue.y+=ny*overlap*.5;const rel=(blue.vx-red.vx)*nx+(blue.vy-red.vy)*ny;if(rel<0){const impulse=-(1+.98)*rel/2;red.vx-=impulse*nx;red.vy-=impulse*ny;blue.vx+=impulse*nx;blue.vy+=impulse*ny;music.hit(Math.min(1,Math.abs(rel)/500));}}
function roundStep(dt:number){red.update(dt);blue.update(dt);collideBalls();elapsed+=dt;if(elapsed>=ROUND_SECONDS)finishRound(red.y>blue.y?'red':'blue');}
function finishRound(w:'red'|'blue'){if(!running)return;running=false;if(w==='red')redWins++;else blueWins++;score.textContent=`${redWins} — ${blueWins}`;status.textContent=`${w==='red'?redName.textContent:blueName.textContent} WINS`;play.textContent='▶ NEXT ROUND';music.hit(1);}
function startRound(){elapsed=0;accumulator=0;resetBalls();running=true;status.textContent='BATTLE LIVE';play.textContent='Ⅱ PAUSE';music.start();}

function drawFlag(code:string,x:number,y:number,r:number){
  ctx.save();ctx.translate(x,y);ctx.rotate(code==='IN' ? -.04 : 0);ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
  const w=r*2,h=r*2;
  if(code==='IN'){ctx.fillStyle='#f7f7f7';ctx.fillRect(-r,-r,w,h);ctx.fillStyle='#ff9933';ctx.fillRect(-r,-r,w,h/3);ctx.fillStyle='#138808';ctx.fillRect(-r,r/3,w,h/3);ctx.strokeStyle='#075aaa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*.22,0,TAU);ctx.stroke();}
  else if(code==='US'){ctx.fillStyle='#fff';ctx.fillRect(-r,-r,w,h);ctx.fillStyle='#b22234';for(let i=-r;i<r;i+=h/7)ctx.fillRect(-r,i,w,h/14);ctx.fillStyle='#3c3b6e';ctx.fillRect(-r,-r,w*.55,h*.55);}
  else if(code==='JP'){ctx.fillStyle='#fff';ctx.fillRect(-r,-r,w,h);ctx.fillStyle='#bc002d';ctx.beginPath();ctx.arc(0,0,r*.48,0,TAU);ctx.fill();}
  else if(code==='DE'){ctx.fillStyle='#111';ctx.fillRect(-r,-r,w,h/3);ctx.fillStyle='#d00';ctx.fillRect(-r,-r/3,w,h/3);ctx.fillStyle='#ffce00';ctx.fillRect(-r,r/3,w,h/3);}
  else if(code==='FR'){const cw=w/3;ctx.fillStyle='#1d4ed8';ctx.fillRect(-r,-r,cw,h);ctx.fillStyle='#fff';ctx.fillRect(-r+cw,-r,cw,h);ctx.fillStyle='#ef4444';ctx.fillRect(-r+2*cw,-r,cw,h);}
  else if(code==='IT'){const cw=w/3;ctx.fillStyle='#15803d';ctx.fillRect(-r,-r,cw,h);ctx.fillStyle='#fff';ctx.fillRect(-r+cw,-r,cw,h);ctx.fillStyle='#dc2626';ctx.fillRect(-r+2*cw,-r,cw,h);}
  else if(code==='BR'){ctx.fillStyle='#15803d';ctx.fillRect(-r,-r,w,h);ctx.fillStyle='#facc15';ctx.beginPath();ctx.moveTo(0,-r*.72);ctx.lineTo(r*.75,0);ctx.lineTo(0,r*.72);ctx.lineTo(-r*.75,0);ctx.closePath();ctx.fill();ctx.fillStyle='#2563eb';ctx.beginPath();ctx.arc(0,0,r*.32,0,TAU);ctx.fill();}
  else {ctx.fillStyle='#fff';ctx.fillRect(-r,-r,w,h);ctx.font=`${r*1.15}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(COUNTRIES.find(c=>c[0]===code)?.[1]||'🏳️',0,1);}
  ctx.restore();ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.lineWidth=3;ctx.strokeStyle=code===redSelect.value?'#ff5570':'#62a5ff';ctx.stroke();ctx.restore();
}
function drawBall(ball:CountryBall,code:string){ctx.save();for(let i=0;i<ball.trail.length;i++){const p=ball.trail[i]!,a=(i/ball.trail.length)*.15;ctx.globalAlpha=a;ctx.fillStyle=ball.team==='red'?'#ff3158':'#3584ff';ctx.beginPath();ctx.arc(p.x,p.y,BALL_RADIUS*(.45+i/ball.trail.length*.35),0,TAU);ctx.fill();}ctx.globalAlpha=1;const glow=ctx.createRadialGradient(ball.x,ball.y,5,ball.x,ball.y,BALL_RADIUS*2.3);glow.addColorStop(0,ball.team==='red'?'rgba(255,49,88,.5)':'rgba(53,132,255,.5)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(ball.x,ball.y,BALL_RADIUS*2.3,0,TAU);ctx.fill();ctx.restore();drawFlag(code,ball.x,ball.y,BALL_RADIUS);}
function draw(){const g=ctx.createRadialGradient(centerX,centerY,0,centerX,centerY,Math.max(width,height));g.addColorStop(0,'#172f50');g.addColorStop(.5,'#08182b');g.addColorStop(1,'#020711');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);for(let i=0;i<70;i++){const x=(i*83)%width,y=(i*137)%height;ctx.globalAlpha=.18;ctx.fillStyle='#fff';ctx.fillRect(x,y,1.5,1.5);}ctx.globalAlpha=1;ctx.beginPath();ctx.arc(centerX,centerY,arenaRadius,0,TAU);const f=ctx.createRadialGradient(centerX,centerY,0,centerX,centerY,arenaRadius);f.addColorStop(0,'rgba(22,48,79,.98)');f.addColorStop(1,'rgba(3,12,23,.98)');ctx.fillStyle=f;ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.arc(centerX,centerY,arenaRadius-10,0,TAU);ctx.stroke();ctx.save();ctx.setLineDash([8,12]);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(centerX-arenaRadius,centerY);ctx.lineTo(centerX+arenaRadius,centerY);ctx.stroke();ctx.restore();drawBall(red,redSelect.value);drawBall(blue,blueSelect.value);if(running){ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.fillText(`${Math.max(0,ROUND_SECONDS-elapsed).toFixed(1)}s`,centerX,centerY+arenaRadius+26);}}
function frame(now:number){const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(running){accumulator+=dt;while(accumulator>=FIXED_DT){roundStep(FIXED_DT);accumulator-=FIXED_DT;}}draw();requestAnimationFrame(frame);}
function updateCountry(side:'red'|'blue'){const s=side==='red'?redSelect:blueSelect;const t=COUNTRIES.find(c=>c[0]===s.value)??COUNTRIES[0]!;if(side==='red'){redFlag.textContent=t[1];redName.textContent=t[2];}else{blueFlag.textContent=t[1];blueName.textContent=t[2];}}
play.addEventListener('click',()=>{if(running){running=false;play.textContent='▶ RESUME';status.textContent='PAUSED';}else startRound();});restart.addEventListener('click',()=>{redWins=0;blueWins=0;score.textContent='0 — 0';startRound();});redSelect.addEventListener('change',()=>updateCountry('red'));blueSelect.addEventListener('change',()=>updateCountry('blue'));window.addEventListener('resize',resize);updateCountry('red');updateCountry('blue');resize();requestAnimationFrame(frame);
