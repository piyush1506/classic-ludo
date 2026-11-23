// Online multiplayer (host-authoritative, uses the claude.ai artifact `room` capability).
// Works only when the page is published as a claude.ai artifact; offline it shows a notice.
const PL=n=>n==2?[0,2]:n==3?[0,1,2]:[0,1,2,3],lob=t=>$('#lobby').textContent=t,rnd=()=>Math.random().toString(36).slice(2,8);
function bc(){if(!net||!net.host||!net.live)return;net.r.emit('st',{sid:net.sid,pl,T,cur,d,ph:phase,mv,busy,over,wt:$('#wt').textContent,rd:net.rd,m:net.m,nm:net.nms,tk:net.tk}).catch(()=>{})}
function lobShow(n){lob('Room code: '+net.code.toUpperCase()+'\n'+n.map((x,i)=>(i+1)+'. '+x).join('\n')+(net.host?'\nShare the code, then start.':'\nWaiting for the host to start…'));const g=$('#go');g.style.display=net.host?'':'none';g.disabled=n.length<2;g.textContent='Start game ('+n.length+')'}
function seat(){const n=net.list.map(x=>x.name);net.r.emit('seat',{n}).catch(()=>{});lobShow(n)}
function mk(){pl.forEach(p=>{for(let i=0;i<4;i++){const e=document.createElement('div');e.className='t';e.style.setProperty('--c',C[p]);e.onclick=()=>{if(phase==='move'&&mine(pl[cur])&&p===pl[cur]&&mv.includes(i))move(i)};B.appendChild(e);E[p][i]=e}})}
function sync(s){
 if(!net||net.host||!s||!Array.isArray(s.T)||!Array.isArray(s.pl))return;
 net.nms=s.nm||[];net.me=(s.tk||[]).indexOf(net.tok);net.live=1;
 if(s.sid!==net.sid){net.sid=s.sid;B.querySelectorAll('.t').forEach(e=>e.remove());pl=s.pl;E=[[],[],[],[]];mk()}
 T=s.T;cur=s.cur;phase=s.ph;mv=s.mv||[];busy=s.busy;over=s.over;d=s.d;
 if(s.rd!==net.rd){net.rd=s.rd;spin(s.d)}
 msg(String(s.m||''));$('#setup').classList.add('h');
 if(s.over){$('#wt').textContent=String(s.wt);$('#win').classList.remove('h')}else $('#win').classList.add('h');
 hud();render()}
async function openRoom(code,host){
 if(net){clearInterval(net.iv);net.r.leave();net=null}
 const room=typeof claude!=='undefined'?await claude.use('room').catch(()=>null):null;
 if(!room){lob('Online play works when this page is open in claude.ai and you have access to it.');return}
 let r;try{r=await room.join('ludo-'+code)}catch(e){lob('Could not open the room. Try again.');return}
 const name=($('#nm').value.trim()||'Player').slice(0,12),tok=rnd();
 net={r,host,code,tok,name,list:host?[{peer:null,tok,name}]:[],pl:[],pc:{},rd:0,m:'',sid:0,me:-1,nms:[],tk:[],live:0};
 r.on('hi',m=>{if(!net||!net.host||m.isMe||net.live)return;const d0=m.data||{},t=String(d0.tok||'').slice(0,8);if(t&&net.list.length<4&&!net.list.some(x=>x.tok===t))net.list.push({peer:m.peer,tok:t,name:String(d0.name||'Player').slice(0,12)});seat()});
 r.on('seat',m=>{if(!net||net.host||m.isMe||net.live)return;const d0=m.data||{};if(Array.isArray(d0.n))lobShow(d0.n.map(String))});
 r.on('st',m=>{if(!m.isMe)sync(m.data)});
 r.on('act',m=>{if(!net||!net.host||m.isMe||!net.live)return;const d0=m.data||{},c=net.pc[m.peer];if(c===undefined||c!==pl[cur]||d0.sid!==net.sid)return;if(d0.t==='r')roll();else if(d0.t==='m'&&mv.includes(d0.i))move(d0.i)});
 net.iv=setInterval(()=>{if(!net)return;if(net.host)net.live?bc():seat();else if(!net.live)r.emit('hi',{name,tok}).catch(()=>{})},2500);
 if(host)seat();else{lob('Joining room '+code.toUpperCase()+'…');r.emit('hi',{name,tok}).catch(()=>{})}
}
function go(){const n=net.list.length;net.pl=PL(n);net.nms=[null,null,null,null];net.tk=[null,null,null,null];net.pc={};net.list.forEach((x,j)=>{const c=net.pl[j];net.nms[c]=x.name;net.tk[c]=x.tok;if(x.peer)net.pc[x.peer]=c});net.me=net.pl[0];start()}
function onl(x){$('#on').style.display=x?'flex':'none';['#np','#npl'].forEach(s=>$(s).style.display=x?'none':'');$('#go').style.display=x?'none':'';if(!x&&net){clearInterval(net.iv);net.r.leave();net=null;lob('')}}
$('#go').onclick=()=>{if(!net)start();else if(net.host&&net.list.length>1)go()};
$('#again').onclick=()=>{if(!net||net.host)start();else $('#win').classList.add('h')};
$('#mk').onclick=()=>openRoom(Array.from({length:4},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*31)]).join(''),true);
$('#jn').onclick=()=>{const c=$('#cd').value.trim().toLowerCase();/^[a-z0-9]{4}$/.test(c)?openRoom(c,false):lob('Enter the 4-character room code')};
