const C=['#e53935','#43a047','#fbc02d','#1e88e5'],N=['Red','Green','Yellow','Blue'];
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const S=[0,13,26,39],STAR=[8,21,34,47],SAFE=[...S,...STAR];
const H=[[1,2,3,4,5].map(c=>[7,c]),[1,2,3,4,5].map(r=>[r,7]),[13,12,11,10,9].map(c=>[7,c]),[13,12,11,10,9].map(r=>[r,7])];
const YO=[[0,0],[0,9],[9,9],[9,0]],SP=[[1.5,1.5],[1.5,4.5],[4.5,1.5],[4.5,4.5]];
const B=$('#b');
P.forEach(([r,c],i)=>{const d=document.createElement('div');d.className='c';d.style.gridArea=`${r+1}/${c+1}`;const s=S.indexOf(i);if(s>=0)d.style.background=C[s];else if(STAR.includes(i))d.textContent='★';B.appendChild(d)});
H.forEach((h,p)=>h.forEach(([r,c])=>{const d=document.createElement('div');d.className='c';d.style.gridArea=`${r+1}/${c+1}`;d.style.background=C[p];B.appendChild(d)}));
YO.forEach(([r,c],p)=>{const y=document.createElement('div');y.className='y';y.style.gridArea=`${r+1}/${c+1}/span 6/span 6`;y.style.background=C[p];y.innerHTML='<i></i>'+SP.map(([a,b])=>`<b style="left:${b/6*100}%;top:${a/6*100}%;background:${C[p]}"></b>`).join('');B.appendChild(y)});
const ctr=document.createElement('div');ctr.id='ctr';B.appendChild(ctr);

let net=null,np=4,vs=1,pl=[],T=[],E=[],cur=0,mv=[],d=0,six=0,phase='roll',busy=0,over=0,gid=0;
const isAI=p=>vs&&p!==0;const mine=p=>net?p===net.me:!isAI(p);
const cellOf=(p,k)=>k<0?null:k<=50?P[(S[p]+k)%52]:k<56?H[p][k-51]:null;
function pos(p,i){const k=T[p][i];if(k<0)return[YO[p][0]+SP[i][0],YO[p][1]+SP[i][1]];if(k===56)return[7.5+[0,-.9,0,.9][p]+(i-1.5)*.12,7.5+[-.9,0,.9,0][p]+(i-1.5)*.12];const[r,c]=cellOf(p,k);return[r+.5,c+.5]}
function render(){
 const g={};pl.forEach(p=>T[p].forEach((k,i)=>{const[r,c]=pos(p,i);(g[r+','+c]=g[r+','+c]||[]).push([p,i,r,c])}));
 Object.values(g).forEach(a=>a.forEach(([p,i,r,c],j)=>{const n=a.length,o=n>1?(j-(n-1)/2)*.32:0,e=E[p][i];
  e.style.left=((c+o)/15*100)+'%';e.style.top=(r/15*100)+'%';e.style.transform=`translate(-50%,-64%) scale(${n>1?.78:1})`;
  e.classList.toggle('m',phase==='move'&&mine(pl[cur])&&p===pl[cur]&&mv.includes(i))}));bc();
}
const msg=t=>{$('#msg').textContent=t;if(net)net.m=t};
function hud(){const p=pl[cur];$('#dot').style.background=C[p];$('#turn').textContent=N[p]+(net?(net.nms[p]?' ('+(p===net.me?'You':net.nms[p])+')':''):vs&&p?' (CPU)':vs?' (You)':'’s turn');const dc=$('#dice');dc.style.setProperty('--c',C[p]);$('#dice').disabled=isAI(p)||!mine(p)||phase!=='roll'||!!busy}
function legal(p,d){const r=[];T[p].forEach((k,i)=>{if(k<0?d===6:k+d<=56)r.push(i)});return r}
function hits(p,i,d){const k=T[p][i],nk=k<0?0:k+d;if(nk>50)return false;const a=(S[p]+nk)%52;if(SAFE.includes(a))return false;return pl.some(q=>q!==p&&T[q].some(x=>x>=0&&x<=50&&(S[q]+x)%52===a))}
function pick(p,m,d){let best=m[0],bs=-1e9;m.forEach(i=>{const k=T[p][i],nk=k<0?0:k+d;let s=Math.random()*5+(k<0?0:k)*.2;if(hits(p,i,d))s+=100;if(nk===56)s+=80;if(k<0)s+=50;if(nk<=50&&SAFE.includes((S[p]+nk)%52))s+=25;if(nk>50&&nk<56)s+=20;if(s>bs){bs=s;best=i}});return best}
async function roll(){
 if(net&&!net.host){if(!busy&&phase==='roll'&&!over&&mine(pl[cur])){busy=1;hud();net.r.emit('act',{t:'r',sid:net.sid}).catch(()=>{})}return}if(busy||phase!=='roll'||over)return;busy=1;const id=gid,p=pl[cur];hud();d=1+Math.floor(Math.random()*6);spin(d);if(net)net.rd++,bc();await sleep(1000);
 
 if(id!==gid)return;
 six=d===6?six+1:0;
 if(six===3){msg('Three 6s: turn lost');six=0;await sleep(900);return next(id)}
 mv=legal(p,d);if(mv.every(i=>T[p][i]<0))mv=mv.slice(0,1);
 if(!mv.length){msg('No move');await sleep(850);return next(id)}
 phase='move';busy=0;msg('Rolled '+d);hud();render();
 if(isAI(p)){await sleep(550);if(id===gid)move(pick(p,mv,d))}
 else if(mv.length===1){await sleep(350);if(id===gid)move(mv[0])}
}
async function move(i){
 if(net&&!net.host){if(phase==='move'&&!busy&&mine(pl[cur])&&mv.includes(i)){busy=1;net.r.emit('act',{t:'m',i,sid:net.sid}).catch(()=>{})}return}if(phase!=='move'||busy)return;busy=1;const id=gid,p=pl[cur];phase='anim';mv=[];
 if(T[p][i]<0){T[p][i]=0;render();await sleep(220)}
 else for(let s=0;s<d;s++){T[p][i]++;render();await sleep(130)}
 if(id!==gid)return;
 const k=T[p][i];let cap=false;
 if(k<=50){const a=(S[p]+k)%52;if(!SAFE.includes(a))pl.forEach(q=>{if(q===p)return;T[q].forEach((x,j)=>{if(x>=0&&x<=50&&(S[q]+x)%52===a){T[q][j]=-1;cap=true}})})}
 render();
 if(T[p].every(x=>x===56)){over=1;$('#wt').textContent=N[p]+' wins!';bc();$('#win').classList.remove('h');return}
 if(d===6||cap||k===56){msg(cap?'Captured! Roll again':k===56?'Home! Roll again':'Roll again');phase='roll';busy=0;hud();render();if(isAI(p)){await sleep(700);if(id===gid)roll()}}
 else next(id);
}
async function next(id){
 if(id!==gid)return;cur=(cur+1)%pl.length;six=0;phase='roll';busy=0;mv=[];hud();render();
 if(isAI(pl[cur])){await sleep(700);if(id===gid)roll()}
}
function start(){
 gid++;over=0;if(net)net.sid++,net.live=1;B.querySelectorAll('.t').forEach(e=>e.remove());
 pl=net?net.pl:np===2?[0,2]:np===3?[0,1,2]:[0,1,2,3];T=[[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]];E=[[],[],[],[]];
 pl.forEach(p=>{for(let i=0;i<4;i++){const e=document.createElement('div');e.className='t';e.style.setProperty('--c',C[p]);e.onclick=()=>{if(phase==='move'&&mine(pl[cur])&&p===pl[cur]&&mv.includes(i))move(i)};B.appendChild(e);E[p][i]=e}});
 cur=0;phase='roll';busy=0;mv=[];six=0;msg('Tap the dice');hud();render();
 $('#setup').classList.add('h');$('#win').classList.add('h');
}
const cube=$('#cube'),PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]},ROT={1:'',6:'rotateY(180deg)',3:'rotateY(90deg)',4:'rotateY(-90deg)',2:'rotateX(90deg)',5:'rotateX(-90deg)'},FACE={1:[0,0],6:[0,180],3:[0,-90],4:[0,90],2:[-90,0],5:[90,0]};
let cx=0,cy=0;
for(const v in PIPS){const f=document.createElement('i');f.className='f';f.style.transform=`${ROT[v]} translateZ(calc(var(--s)/2))`;for(let j=0;j<9;j++){const s=document.createElement('s');if(!PIPS[v].includes(j))s.style.visibility='hidden';else if(v==1)s.className='r1';f.appendChild(s)}cube.appendChild(f)}
cube.style.transform='rotateX(-22deg) rotateY(28deg)';
function spin(v){const[x,y]=FACE[v];cx+=720;cy+=1080;cube.style.transform=`rotateX(${x-22+cx}deg) rotateY(${y+28+cy}deg)`;const s=$('#dice .sc');s.classList.remove('hop');void s.offsetWidth;s.classList.add('hop')}
$('#dice').onclick=roll;
$('#menu').onclick=()=>$('#setup').classList.remove('h');
[['#np',v=>np=+v],['#md',v=>{vs=v==='1'?1:0;onl(v==='2')}]].forEach(([s,f])=>$(s).onclick=e=>{const b=e.target.closest('button');if(!b)return;$(s).querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));f(b.dataset.v)});
