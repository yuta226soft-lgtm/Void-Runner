// Save/Load system
let playerData={nickname:'PLAYER', highScore:0, coins:0, medals:0, level:1, exp:0, rankings:[]};
function savePlayerData(){
  const nick=document.getElementById('nicknameInput').value.trim();
  if(nick) playerData.nickname=nick;
  localStorage.setItem('voidRunnerData',JSON.stringify(playerData));
}
function loadPlayerData(){
  const d=localStorage.getItem('voidRunnerData'); 
  if(d) {
    const loaded = JSON.parse(d);
    playerData = {
      nickname: loaded.nickname || 'PLAYER',
      highScore: loaded.highScore || 0,
      coins: loaded.coins || 0,
      medals: loaded.medals || 0,
      level: loaded.level || 1,
      exp: loaded.exp || 0,
      rankings: loaded.rankings || []
    };
  }
}
loadPlayerData();

const canvas=document.getElementById('gameCanvas'), ctx=canvas.getContext('2d');
let W, H, cx, cy;
function resize(){W=canvas.width=canvas.clientWidth; H=canvas.height=canvas.clientHeight; cx=W/2; cy=H/2;}
resize(); window.addEventListener('resize',resize);

// Game State
let gameRunning=false, score=0, gameCoins=0, gameMedals=0, pieces=0, combo=0, comboTimer=0, maxCombo=0;
let wave=1, waveTimer=0, enemiesInWave=0;
let playerHP=100, playerMaxHP=100, livesMax=50, livesCurrent=50;
let bossActive=false, boss=null;
let items=[null,null,null,null,null];
let lastTime=0, dt=0, zOffset=0;
let moveLevel=1, orbs=0, orbsTarget=30;
let dropUpActive=0;
let difficulty='normal';
let damageMultiplier=1;
let fireRateMultiplier=1;
let tutorialMode=false, tutorialKills=0, tutorialPhase=0;
let skillUses=0, itemUses=0, enemiesKilled=0;

// Difficulty multipliers
let diffMult={playerMaxHP:1, playerDmg:1, enemySpeed:1, bulletSpeed:1, bossHP:1, lives:1, expMult:1, coinMult:1, enemyBulletSpeed:1, fireRate:1};

// Level multipliers
let lvl={speed:1, fire:1, size:1, shots:1, hp:0, comboT:3, dmg:1};

// Input
const keys={};
let mouseX=0, mouseY=0, mouseDown=false, touchActive=false, touchX=0, touchY=0;
document.addEventListener('keydown', e=>{keys[e.key.toLowerCase()]=true; if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault();});
document.addEventListener('keyup', e=>{
  keys[e.key.toLowerCase()]=false; 
  if(['1','2','3','4','5'].includes(e.key)) useItem(parseInt(e.key)-1); 
  
  // スキルキーの修正
  const key = e.key.toLowerCase();
  if(key === 'c') useSkill('homing');
  if(key === 'v') useSkill('wave');
  if(key === 'b') useSkill('dropup');
  if(key === 'n') useSkill('megabomb');
});
canvas.addEventListener('mousemove', e=>{mouseX=e.offsetX*(W/canvas.clientWidth); mouseY=e.offsetY*(H/canvas.clientHeight);});
canvas.addEventListener('mousedown', e=>{mouseDown=true; e.preventDefault();});
canvas.addEventListener('mouseup', ()=>mouseDown=false);
canvas.addEventListener('touchstart', e=>{touchActive=true; const t=e.touches[0]; const r=canvas.getBoundingClientRect(); touchX=(t.clientX-r.left)*(W/r.width); touchY=(t.clientY-r.top)*(H/r.height); mouseDown=true; e.preventDefault();}, {passive:false});
canvas.addEventListener('touchmove', e=>{const t=e.touches[0]; const r=canvas.getBoundingClientRect(); touchX=(t.clientX-r.left)*(W/r.width); touchY=(t.clientY-r.top)*(H/r.height); e.preventDefault();}, {passive:false});
canvas.addEventListener('touchend', ()=>{touchActive=false; mouseDown=false;});

// Player
let player={x:0, y:0, speed:280, fireRate:0.12, fireTimer:0, invincible:0, shield:false, rapidFire:0, spread:0};

// Object pools
let bullets=[], enemies=[], particles=[], coins_obj=[], powerups=[], ebullets=[], stars=[];
const MAX_P=200;

function initStars(){
  stars=[];
  for(let i=0;i<100;i++) stars.push({x:Math.random()*2-1, y:Math.random()*2-1, z:Math.random()*3+0.5, b:Math.random()});
}

const ITEMS=[
  {id:'shield', emoji:'🛡️', d:5, name:'Shield'},
  {id:'rapid', emoji:'⚡', d:5, name:'Rapid'},
  {id:'bomb', emoji:'💥', d:0, name:'Bomb'},
  {id:'heal', emoji:'💚', d:0, name:'Heal'},
  {id:'spread', emoji:'🌊', d:5, name:'Spread'},
  {id:'lives', emoji:'❤️', d:0, name:'Lives'}
];

function useItem(i){
  if(!items[i]) return;
  const it=items[i];
  itemUses++;
  if(it.id==='shield'){player.shield=true; player.invincible=it.d;}
  else if(it.id==='rapid'){player.rapidFire=it.d;}
  else if(it.id==='bomb') useBomb();
  else if(it.id==='heal'){playerHP=Math.min(playerMaxHP,playerHP+30);}
  else if(it.id==='spread'){player.spread=it.d;}
  else if(it.id==='lives'){livesCurrent=Math.min(livesMax,livesCurrent+20);}
  items[i]=null;
  updateItemUI();
}

function useBomb(){
  enemies.forEach(e=>{
    if(!e.isBoss){spawnExp(e.x,e.y,'#ff4400',8); score+=e.score||100; addCombo(); enemiesKilled++;} 
    else{e.hp-=50; spawnExp(e.x,e.y,'#ff0',16);}
  });
  enemies=enemies.filter(e=>e.isBoss&&e.hp>0);
  ebullets=[];
}

function useSkill(s){
  if(s==='homing' && pieces>=100){
    pieces-=100; 
    spawnHomingBullets(); 
    skillUses++;
  } 
  else if(s==='wave' && pieces>=500){
    pieces-=500; 
    spawnWaveBullets(); 
    skillUses++;
  } 
  else if(s==='dropup' && pieces>=1000){
    pieces-=1000; 
    dropUpActive=15; 
    skillUses++;
  } 
  else if(s==='megabomb' && pieces>=5000){
    pieces-=5000; 
    spawnMegabomb(); 
    skillUses++;
  }
  updateSkillButtons();
}

function updateSkillButtons(){
  const btns=[
    {el:document.getElementById('skillHomingBtn'), cost:100},
    {el:document.getElementById('skillWaveBtn'), cost:500},
    {el:document.getElementById('skillDropBtn'), cost:1000},
    {el:document.getElementById('skillBombBtn'), cost:5000}
  ];
  
  btns.forEach(btn=>{
    btn.el.classList.remove('disabled','ready','used');
    
    if(pieces >= btn.cost && pieces < btn.cost * 2){
      btn.el.classList.add('used');  // 黄色：使ったら足りなくなる
    } 
    else if(pieces >= btn.cost){
      btn.el.classList.add('ready');  // 緑：余裕がある
    } 
    else {
      btn.el.classList.add('disabled');  // 灰色：使えない
    }
  });
}

function spawnHomingBullets(){
  for(let i=0;i<3;i++){
    bullets.push({x:player.x+(i-1)*8, y:player.y-20, vx:0, vy:-600, life:5, color:'#00ff00', size:5, homing:true, target:null});
  }
}

function spawnWaveBullets(){
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2;
    bullets.push({x:player.x, y:player.y, vx:Math.cos(a)*400, vy:Math.sin(a)*400, life:3, color:'#ffff00', size:6, homing:false});
  }
}

function spawnMegabomb(){
  if(particles.length<MAX_P) particles.push({x:player.x, y:player.y, vx:0, vy:0, life:0.2, maxLife:0.2, color:'#ffff00', size:70});
  const closest=enemies.reduce((a,b)=>a&&Math.hypot(a.x-player.x,a.y-player.y)<Math.hypot(b.x-player.x,b.y-player.y)?a:b,null);
  if(closest){
    closest.hp-=200;
    for(let i=0;i<16;i++){
      const a=(i/16)*Math.PI*2;
      if(bullets.length<200) bullets.push({x:closest.x, y:closest.y, vx:Math.cos(a)*550, vy:Math.sin(a)*550, life:2.5, color:'#ff6600', size:5});
    }
  }
}

function updateItemUI(){
  const c=document.getElementById('itemSlots');
  c.innerHTML='';
  for(let i=0;i<5;i++){
    const slot=document.createElement('div');
    slot.className='item-slot'+(items[i]?'':' empty');
    slot.innerHTML=items[i]?items[i].emoji:'−';
    const h=document.createElement('span');
    h.className='key-hint';
    h.textContent=i+1;
    slot.appendChild(h);
    const gauge=document.createElement('div');
    gauge.className='item-gauge';
    const gaugeFill=document.createElement('div');
    gaugeFill.className='item-gauge-fill';
    gaugeFill.style.width=items[i]?'100%':'0%';
    gauge.appendChild(gaugeFill);
    slot.appendChild(gauge);
    if(items[i]) slot.addEventListener('click',()=>useItem(i));
    c.appendChild(slot);
  }
}

function spawnBullet(x,y,a,sp,enemy,col){
  const arr=enemy?ebullets:bullets;
  if(arr.length>=250) return;
  let sz=3;
  if(!enemy) sz=3+lvl.size*2;
  const actualSp=enemy?sp*diffMult.enemyBulletSpeed:sp*diffMult.bulletSpeed;
  arr.push({x,y,vx:Math.cos(a)*actualSp,vy:Math.sin(a)*actualSp,life:3,color:col||(enemy?'#ff4444':'#0cf'),size:sz});
}

function drawEnemyShape(e){
  const sh=e.shape||'square';
  ctx.fillStyle=e.color||'#ff6644';
  ctx.strokeStyle='#fff';
  ctx.lineWidth=1.5;
  
  if(sh==='square'){
    ctx.fillRect(-e.size/2,-e.size/2,e.size,e.size);
    ctx.strokeRect(-e.size/2,-e.size/2,e.size,e.size);
  } else if(sh==='triangle'){
    ctx.beginPath();
    ctx.moveTo(0,-e.size/2);
    ctx.lineTo(e.size/2,e.size/2);
    ctx.lineTo(-e.size/2,e.size/2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if(sh==='diamond'){
    ctx.beginPath();
    ctx.moveTo(0,-e.size/2);
    ctx.lineTo(e.size/2,0);
    ctx.lineTo(0,e.size/2);
    ctx.lineTo(-e.size/2,0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if(sh==='hexagon'){
    ctx.beginPath();
    for(let i=0;i<6;i++){
      const a=(i/6)*Math.PI*2;
      const x=Math.cos(a)*e.size/2, y=Math.sin(a)*e.size/2;
      ctx[i===0?'moveTo':'lineTo'](x,y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if(sh==='star'){
    ctx.beginPath();
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI*2-Math.PI/2;
      const r=i%2===0?e.size/2:e.size/4;
      const x=Math.cos(a)*r, y=Math.sin(a)*r;
      ctx[i===0?'moveTo':'lineTo'](x,y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0,0,e.size/2,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
  }

  if(e.maxHp>1 && !e.isBoss){
    const bw=e.size*1.6;
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.fillRect(-bw/2,-e.size/2-6,bw,3);
    ctx.fillStyle='#0f0';
    ctx.fillRect(-bw/2,-e.size/2-6,bw*(e.hp/e.maxHp),3);
  }
}

function spawnEnemy(t){
  let e={x:cx+(Math.random()-0.5)*W*0.6, y:-40, hp:1, maxHp:1, speed:60+Math.random()*40, type:t, fireTimer:Math.random()*2, score:100, size:18, isBoss:false, angle:0, shape:'square', pattern:Math.floor(Math.random()*3)};
  e.speed*=diffMult.enemySpeed;
  
  if(tutorialMode && tutorialPhase<2){
    e.speed*=0.5;
    e.hp=1;
    e.maxHp=1;
    e.fireTimer=1000;
  } else if(wave<11){
    const shapes=['square','triangle','diamond'];
    const colors=['#ff8833','#33ff00','#00ffff'];
    e.shape=shapes[Math.floor(Math.random()*shapes.length)];
    e.color=colors[Math.floor(Math.random()*colors.length)];
    if(t==='fast'){e.speed=80+Math.random()*40; e.size=16; e.score=120; e.shape='triangle';}
    else if(t==='tank'){e.hp=2+Math.floor(wave/4); e.maxHp=e.hp; e.speed=45; e.size=24; e.score=220; e.shape='hexagon';}
    else if(t==='shooter'){e.hp=1; e.maxHp=1; e.speed=50; e.size=20; e.score=180; e.shape='diamond';}
    else{e.hp=1; e.maxHp=e.hp;}
  } else if(wave<31){
    e.shape=['triangle','diamond','hexagon'][Math.floor(Math.random()*3)];
    if(t==='purple'){e.hp=Math.max(2,Math.floor((4+wave)*0.75)); e.maxHp=e.hp; e.speed=Math.max(50,Math.floor((80+wave)*0.85)); e.size=22; e.score=400; e.color='#9933ff';}
    else if(t==='black'){e.hp=Math.max(2,Math.floor((3+wave/2)*0.75)); e.maxHp=e.hp; e.speed=Math.max(60,Math.floor((100+wave*1.5)*0.85)); e.size=20; e.score=350; e.color='#333333';}
  } else if(wave<61){
    e.shape=['square','star','hexagon'][Math.floor(Math.random()*3)];
    if(t==='gold'){e.hp=Math.max(3,Math.floor((5+wave/2)*0.75)); e.maxHp=e.hp; e.speed=Math.max(70,Math.floor((120+wave*2)*0.85)); e.size=24; e.score=600; e.color='#ffdd00';}
    else if(t==='silver'){e.hp=Math.max(3,Math.floor((4+wave/3)*0.75)); e.maxHp=e.hp; e.speed=Math.max(65,Math.floor((110+wave*1.8)*0.85)); e.size=20; e.score=500; e.color='#cccccc';}
    else if(t==='bronze'){e.hp=Math.max(2,Math.floor((3+wave/4)*0.75)); e.maxHp=e.hp; e.speed=Math.max(60,Math.floor((100+wave)*0.85)); e.size=18; e.score=400; e.color='#cc8844';}
  } else {
    e.shape=['star','hexagon','diamond'][Math.floor(Math.random()*3)];
    if(t==='rainbow'){e.hp=Math.max(4,Math.floor((6+wave/5)*0.75)); e.maxHp=e.hp; e.speed=Math.max(80,Math.floor((130+Math.random()*20)*0.85)); e.size=26; e.score=800; e.color='#'+Math.floor(Math.random()*16777215).toString(16);}
  }
  
  enemies.push(e);
}

function spawnBoss(w){
  let hp=80+w*40;
  if(w>=30) hp=300+w*100;
  hp=Math.max(27, Math.floor(hp/3*diffMult.bossHP));
  boss={x:cx, y:-60, targetY:H*0.18, hp, maxHp:hp, speed:50, size:52, isBoss:true, fireTimer:0, phaseTimer:0, moveDir:1, score:2000+w*500, isMegaBoss:w>=30, shape:'hexagon', angle:0};
  if(w>=30){
    const colors=['#9933ff','#ffdd00','#ff00ff','#ff0088'];
    boss.color=colors[Math.min(3,Math.floor((w-30)/10))];
  } else {
    boss.color='#dd0000';
  }
  enemies.push(boss);
  bossActive=true;
  document.getElementById('bossHpContainer').style.display='flex';
  document.getElementById('bossName').textContent=`⚠ WAVE ${w} BOSS ⚠`;
  announceWave(`⚠ MEGA BOSS ⚠`);
}

function spawnExp(x,y,col,c){
  for(let i=0;i<Math.min(c,15);i++){
    if(particles.length>=MAX_P) break;
    const a=Math.random()*Math.PI*2, sp=50+Math.random()*180;
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.5,maxLife:1,color:col,size:2+Math.random()*3});
  }
}

function spawnCoin(x,y,isMedal){
  const obj={x,y,vy:-30-Math.random()*40,vx:(Math.random()-0.5)*60,life:10,size:10,bobPhase:Math.random()*Math.PI*2,value:isMedal?1:10, isMedal};
  coins_obj.push(obj);
}

function spawnPiece(x,y){
  const obj={x,y,vy:-30-Math.random()*40,vx:(Math.random()-0.5)*60,life:10,size:10,bobPhase:Math.random()*Math.PI*2,value:10, isPiece:true};
  coins_obj.push(obj);
}

function spawnPowerup(x,y){
  if(tutorialMode) return;
  if(Math.random()>(difficulty==='nightmare'?0.9:0.25)) return;
  const t=ITEMS[Math.floor(Math.random()*ITEMS.length)];
  powerups.push({x,y,vy:40,type:t,life:10,size:18,bobPhase:Math.random()*Math.PI*2});
}

function addCombo(){
  combo++;
  comboTimer=lvl.comboT;
  if(combo>maxCombo) maxCombo=combo;
  const el=document.getElementById('comboDisplay');
  el.textContent=`${combo}x COMBO!`;
  el.style.display='block';
}

function resetCombo(){combo=0; document.getElementById('comboDisplay').style.display='none';}

function announceWave(t){
  const el=document.getElementById('waveAnnounce');
  el.textContent=t;
  el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0',2000);
}

function showTutorialTip(title, text){
  const box=document.getElementById('tutorialTipBox');
  document.getElementById('tipTitle').textContent=title;
  document.getElementById('tipText').textContent=text;
  box.style.display='block';
  setTimeout(()=>box.style.display='none',4000);
}

function addOrbs(a){
  const difficulty_increase = 1 + (moveLevel - 1) * 0.05;
  orbs+=a*diffMult.expMult/difficulty_increase;
  if(orbs>=orbsTarget) moveLevelUp();
  updateHUD();
}

function moveLevelUp(){
  moveLevel++;
  orbs=0;
  orbsTarget+=2;
  playerMaxHP+=20;
  playerHP=playerMaxHP;
  livesCurrent+=10;
  livesMax+=10;

  lvl.speed+=0.1;
  lvl.fire+=0.1;
  lvl.size+=0.1;
  lvl.comboT+=0.5;
  lvl.dmg+=0.5;
  damageMultiplier=lvl.dmg;

  if(moveLevel===2) lvl.shots=2;
  else if(moveLevel===3) lvl.shots=3;
  else if(moveLevel===5) playerMaxHP=Math.max(playerMaxHP,150);
  else if(moveLevel===6) lvl.shots=3;

  const fl=document.getElementById('levelUpFlash');
  fl.style.opacity='1';
  setTimeout(()=>fl.style.opacity='0',400);

  const pop=document.getElementById('levelUpPopup');
  document.getElementById('levelUpTitle').textContent=`ムーブ ${moveLevel}!`;
  document.getElementById('levelUpDesc').textContent=`SPEED+0.1 FIRE+0.1 SIZE+0.1 COMBO+0.5s DMG+0.5`;
  pop.style.opacity='1';
  setTimeout(()=>pop.style.opacity='0',3000);
  
  updateHUD();
}

function damagePlayer(d){
  if(player.invincible>0) return;
  playerHP=Math.max(0,playerHP-d);
  player.invincible=0.5;
  const fl=document.getElementById('dmgFlash');
  fl.style.opacity='1';
  setTimeout(()=>fl.style.opacity='0',120);
  if(playerHP<=0) gameOver();
  updateHUD();
}

function getScoreMultiplier(){
  const lv = playerData.level;
  if(lv>=90) return 1.6;
  if(lv>=70) return 1.5;
  if(lv>=50) return 1.4;
  if(lv>=30) return 1.3;
  if(lv>=16) return 1.2;
  if(lv>=6) return 1.1;
  return 1.0;
}

function updateHUD(){
  const mult = getScoreMultiplier();
  document.getElementById('scoreDisplay').textContent=Math.floor(score*mult).toLocaleString();
  document.getElementById('coinDisplay').textContent=`🪙 ${gameCoins}`;
  document.getElementById('medalDisplay').textContent=`🔘 ${gameMedals}`;
  document.getElementById('piecesDisplay').textContent=`💎 ${pieces}`;
  document.getElementById('waveDisplay').textContent=wave;
  document.getElementById('hpBar').style.width=`${(playerHP/playerMaxHP)*100}%`;
  document.getElementById('hpText').textContent=`HP ${Math.ceil(playerHP)}/${playerMaxHP}`;
  const orbsPercent=(orbs/orbsTarget)*100;
  document.getElementById('expBar').style.width=`${orbsPercent}%`;
  document.getElementById('levelDisplay').textContent=`ムーブ ${moveLevel}`;
  const orbsDisplay=Math.round(orbs*100)/100;
  document.querySelector('.exp-sub').textContent=`オーブ ${orbsDisplay}/${orbsTarget}`;
  document.getElementById('livesDisplay').textContent=`❤️ ${livesCurrent}/${livesMax}`;
  document.getElementById('livesBar').style.width=`${(livesCurrent/livesMax)*100}%`;
  document.getElementById('nicknameDisplay').textContent=playerData.nickname;
  
  // Player level and exp
  document.getElementById('playerLevelText').textContent=`LV ${playerData.level}`;
  const expPercent = (playerData.exp % 25000) / 25000 * 100;
  document.getElementById('playerExpBar').style.width=`${expPercent}%`;
  
  document.getElementById('playerHSDisplay').textContent=playerData.highScore.toLocaleString();
  document.getElementById('playerCoinDisplay').textContent=playerData.coins;
  document.getElementById('playerMedalDisplay').textContent=playerData.medals;
  
  if(bossActive&&boss) document.getElementById('bossHpBar').style.width=`${(boss.hp/boss.maxHp)*100}%`;
  updateSkillButtons();
}

function updateHomeDisplay(){
  document.getElementById('homeHighScore').textContent=playerData.highScore.toLocaleString();
  document.getElementById('homeCoinCount').textContent=playerData.coins;
  document.getElementById('homeMedalCount').textContent=playerData.medals;
  document.getElementById('homeLevelText').textContent=`LV ${playerData.level}`;
  const expPercent = (playerData.exp % 25000) / 25000 * 100;
  document.getElementById('homeExpBar').style.width=`${expPercent}%`;
}

function addPlayerExp(amount){
  playerData.exp += amount;
  
  while(playerData.exp >= 25000 && playerData.level < 99){
    playerData.exp -= 25000;
    playerData.level++;
    
    // Level up rewards
    let coinReward = 100, medalReward = 50;
    if(playerData.level >= 90) { coinReward = 1200; medalReward = 450; }
    else if(playerData.level >= 70) { coinReward = 1000; medalReward = 400; }
    else if(playerData.level >= 50) { coinReward = 900; medalReward = 300; }
    else if(playerData.level >= 30) { coinReward = 750; medalReward = 200; }
    else if(playerData.level >= 16) { coinReward = 500; medalReward = 150; }
    else if(playerData.level >= 6) { coinReward = 250; medalReward = 100; }
    
    if(playerData.level === 99) { coinReward = 1300; medalReward = 500; }
    
    playerData.coins += coinReward;
    playerData.medals += medalReward;
  }
  
  if(playerData.level >= 99) {
    playerData.level = 99;
    playerData.exp = 0;
  }
}

function calculateGameExp(){
  const baseExp = 100;
  const skillExp = skillUses * 20;
  const itemExp = itemUses * 10;
  const enemyExp = enemiesKilled * 5;
  const waveExp = wave * 10;
  const moveExp = moveLevel * 10;
  return baseExp + skillExp + itemExp + enemyExp + waveExp + moveExp;
}

function addToRankings(finalScore){
  const mult = getScoreMultiplier();
  const adjustedScore = Math.floor(finalScore * mult);
  
  const entry = {
    score: adjustedScore,
    wave: wave,
    level: playerData.level,
    moveLevel: moveLevel,
    date: new Date().toISOString()
  };
  
  playerData.rankings.push(entry);
  playerData.rankings.sort((a,b) => b.score - a.score);
  playerData.rankings = playerData.rankings.slice(0, 5);
}

function showRanking(){
  const overlay = document.getElementById('rankingOverlay');
  const list = document.getElementById('rankingList');
  list.innerHTML = '';
  
  if(playerData.rankings.length === 0){
    list.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px">まだランキングがありません</div>';
  } else {
    playerData.rankings.forEach((entry, i) => {
      const item = document.createElement('div');
      item.className = 'ranking-item';
      item.innerHTML = `
        <div>
          <span class="ranking-rank">#${i+1}</span>
          <span class="ranking-score">${entry.score.toLocaleString()}</span>
          <div class="ranking-details">WAVE ${entry.wave} | LV ${entry.level} | ムーブ ${entry.moveLevel}</div>
        </div>
      `;
      list.appendChild(item);
    });
  }
  
  overlay.style.display = 'flex';
}

function closeRanking(){
  document.getElementById('rankingOverlay').style.display = 'none';
}

function showGameOverRanking(){
  const list = document.getElementById('gameOverRankingList');
  list.innerHTML = '';
  
  if(playerData.rankings.length === 0){
    list.innerHTML = '<div style="text-align:center;color:#aaa;padding:10px;font-size:12px">まだランキングがありません</div>';
  } else {
    playerData.rankings.slice(0, 5).forEach((entry, i) => {
      const item = document.createElement('div');
      item.style.cssText = 'background:rgba(0,40,80,.6);border:1px solid #0ff;border-radius:3px;padding:6px;margin-bottom:5px;display:flex;justify-content:space-between;font-size:11px';
      item.innerHTML = `
        <span style="color:#ffd700;font-weight:900">#${i+1}</span>
        <span style="color:#0ff">${entry.score.toLocaleString()}</span>
        <span style="color:#aaa;font-size:9px">W${entry.wave} LV${entry.level}</span>
      `;
      list.appendChild(item);
    });
  }
}

function drawTunnel(){
  const d=25, t=zOffset%1;
  ctx.strokeStyle='rgba(0,180,255,0.08)';
  ctx.lineWidth=1;
  for(let i=0;i<d;i++){
    const z=(i+t)/d, sc=1/(z*4+0.2);
    const baseY=cy-(cy*0.8)*(1-z), screenY=cy+(baseY-cy)*(1+(z-0.5)*0.4);
    const w=W*sc*0.5;
    const alpha=(1-z)*0.15;
    ctx.strokeStyle=`rgba(0,180,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(cx-w,screenY);
    ctx.lineTo(cx+w,screenY);
    ctx.stroke();
  }
}

function drawStars(){
  for(const s of stars){
    s.z-=dt*1.5;
    if(s.z<=0.1){s.z=3+Math.random(); s.x=Math.random()*2-1; s.y=Math.random()*2-1; s.b=Math.random();}
    const sc=1/s.z;
    const sx=cx+s.x*W*sc*0.3, sy=cy+(s.y*H*sc*0.3)*(1+(1/s.z-0.3)*0.3);
    if(sx<0||sx>W||sy<0||sy>H) continue;
    const sz=Math.max(0.5,(1/s.z)*1.5);
    const alpha=Math.min(1,(3-s.z)/2)*s.b;
    ctx.fillStyle=`rgba(200,220,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx,sy,sz,0,Math.PI*2);
    ctx.fill();
  }
}

function drawPlayer(){
  const px=player.x, py=player.y;
  ctx.save();
  ctx.translate(px,py);
  const glowR=20+Math.sin(Date.now()*0.01)*5;
  const grd=ctx.createRadialGradient(0,12,2,0,12,glowR);
  grd.addColorStop(0,'rgba(0,200,255,0.7)');
  grd.addColorStop(0.5,'rgba(0,100,255,0.2)');
  grd.addColorStop(1,'rgba(0,50,200,0)');
  ctx.fillStyle=grd;
  ctx.fillRect(-glowR,12-glowR,glowR*2,glowR*2);
  let shipSz=22;
  if(lvl.size>1) shipSz*=(0.7+lvl.size*0.3);
  ctx.fillStyle='#0cf';
  ctx.strokeStyle='#0af';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(0,-shipSz);
  ctx.lineTo(-shipSz*0.7,shipSz*0.7);
  ctx.lineTo(-shipSz*0.3,shipSz*0.4);
  ctx.lineTo(0,shipSz*0.6);
  ctx.lineTo(shipSz*0.3,shipSz*0.4);
  ctx.lineTo(shipSz*0.7,shipSz*0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle='#fff';
  ctx.beginPath();
  ctx.arc(0,-5,4,0,Math.PI*2);
  ctx.fill();
  if(player.shield&&player.invincible>0){
    ctx.strokeStyle=`rgba(0,255,200,${0.5+Math.sin(Date.now()*0.01)*0.3})`;
    ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.arc(0,0,30,0,Math.PI*2);
    ctx.stroke();
  }
  if(player.invincible>0&&!player.shield) ctx.globalAlpha=0.4+Math.sin(Date.now()*0.02)*0.3;
  ctx.restore();
}

function drawEnemy(e){
  ctx.save();
  ctx.translate(e.x,e.y);
  e.angle=(e.angle||0)+dt*2;
  if(e.isBoss){
    const pls=Math.sin(Date.now()*0.003)*5;
    const aura=ctx.createRadialGradient(0,0,e.size*0.5,0,0,e.size+25+pls);
    aura.addColorStop(0,'rgba(255,0,0,0.2)');
    aura.addColorStop(1,'rgba(255,0,0,0)');
    ctx.fillStyle=aura;
    ctx.fillRect(-e.size-35,-e.size-35,(e.size+35)*2,(e.size+35)*2);
  }
  drawEnemyShape(e);
  ctx.restore();
}

function drawBullet(b){
  ctx.fillStyle=b.color;
  ctx.shadowColor=b.color;
  ctx.shadowBlur=6;
  ctx.beginPath();
  ctx.arc(b.x,b.y,b.size,0,Math.PI*2);
  ctx.fill();
  ctx.shadowBlur=0;
}

function drawCoin(c){
  const bob=Math.sin(c.bobPhase+Date.now()*0.005)*3;
  ctx.save();
  ctx.translate(c.x,c.y+bob);
  if(c.isMedal){
    ctx.fillStyle='#c0c0c0';
    ctx.shadowColor='#c0c0c0';
    ctx.shadowBlur=8;
    ctx.beginPath();
    ctx.arc(0,0,c.size*0.8,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#aaa';
    ctx.beginPath();
    ctx.arc(-2,-2,c.size*0.4,0,Math.PI*2);
    ctx.fill();
  } else if(c.isPiece){
    ctx.fillStyle='#ff69b4';
    ctx.shadowColor='#ff69b4';
    ctx.shadowBlur=6;
    ctx.beginPath();
    for(let i=0;i<4;i++){
      const a=(i/4)*Math.PI*2-Math.PI/4;
      const r=i%2===0?c.size*0.8:c.size*0.4;
      const x=Math.cos(a)*r, y=Math.sin(a)*r;
      ctx[i===0?'moveTo':'lineTo'](x,y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle='#ffd700';
    ctx.shadowColor='#ffd700';
    ctx.shadowBlur=6;
    ctx.beginPath();
    ctx.arc(0,0,c.size*0.7,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.font='bold 8px Orbitron';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('¢',0,1);
  }
  ctx.shadowBlur=0;
  ctx.restore();
}

function drawPowerup(p){
  const bob=Math.sin(p.bobPhase+Date.now()*0.004)*4;
  ctx.save();
  ctx.translate(p.x,p.y+bob);
  ctx.fillStyle='rgba(0,255,200,0.2)';
  ctx.beginPath();
  ctx.arc(0,0,p.size+4,0,Math.PI*2);
  ctx.fill();
  ctx.strokeStyle='rgba(0,255,200,0.7)';
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.font=`bold ${p.size*1.4}px serif`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillStyle='#fff';
  ctx.fillText(p.type.emoji,0,1);
  ctx.restore();
}

function drawParticle(p){
  const alpha=p.life/p.maxLife;
  ctx.globalAlpha=alpha;
  ctx.fillStyle=p.color;
  ctx.beginPath();
  ctx.arc(p.x,p.y,p.size*alpha,0,Math.PI*2);
  ctx.fill();
  ctx.globalAlpha=1;
}

function update(){
  if(!gameRunning) return;
  zOffset+=dt*3;

  let dx=0, dy=0;
  if(keys['a']||keys['arrowleft']) dx=-1;
  if(keys['d']||keys['arrowright']) dx=1;
  if(keys['w']||keys['arrowup']) dy=-1;
  if(keys['s']||keys['arrowdown']) dy=1;
  if(touchActive){const tdx=touchX-player.x, tdy=touchY-player.y, d=Math.sqrt(tdx*tdx+tdy*tdy); if(d>10){dx=tdx/d; dy=tdy/d;}}
  if(dx||dy){const len=Math.sqrt(dx*dx+dy*dy); player.x+=(dx/len)*player.speed*lvl.speed*dt; player.y+=(dy/len)*player.speed*lvl.speed*dt;}
  player.x=Math.max(25,Math.min(W-25,player.x));
  player.y=Math.max(25,Math.min(H-25,player.y));

  let fireRate=player.fireRate/lvl.fire/diffMult.fireRate/fireRateMultiplier;
  if(player.rapidFire>0) fireRate*=0.4;
  player.fireTimer-=dt;
  if((keys[' ']||mouseDown)&&player.fireTimer<=0){
    player.fireTimer=fireRate;
    if(lvl.shots===1){
      spawnBullet(player.x,player.y-24,-Math.PI/2,650,false);
    } else if(lvl.shots===2){
      spawnBullet(player.x-7,player.y-24,-Math.PI/2,650,false);
      spawnBullet(player.x+7,player.y-24,-Math.PI/2,650,false);
    } else if(lvl.shots>=3){
      spawnBullet(player.x-12,player.y-24,-Math.PI/2-0.35,630,false);
      spawnBullet(player.x,player.y-24,-Math.PI/2,650,false);
      spawnBullet(player.x+12,player.y-24,-Math.PI/2+0.35,630,false);
    }
    if(player.spread>0){
      spawnBullet(player.x,player.y-24,-Math.PI/2-0.25,600,false);
      spawnBullet(player.x,player.y-24,-Math.PI/2+0.25,600,false);
    }
  }

  if(player.invincible>0) player.invincible-=dt;
  if(player.rapidFire>0) player.rapidFire-=dt;
  if(player.spread>0) player.spread-=dt;
  if(player.invincible<=0) player.shield=false;
  if(comboTimer>0){comboTimer-=dt; if(comboTimer<=0) resetCombo();}
  if(dropUpActive>0) dropUpActive-=dt;

  waveTimer-=dt;
  const bossTrig=wave%10===0;
  if(!bossActive&&waveTimer<=0&&enemies.length<(tutorialMode?3:12+Math.floor(wave*0.5))){
    const cnt=tutorialMode?2:3+Math.floor(wave*1.3);
    if(enemiesInWave<cnt){
      let types;
      if(tutorialMode) types=['basic'];
      else if(wave<11) types=['basic','fast','tank','shooter'];
      else if(wave<31) types=['purple','black'];
      else if(wave<61) types=['gold','silver','bronze'];
      else types=['rainbow'];
      spawnEnemy(types[Math.floor(Math.random()*types.length)]);
      enemiesInWave++;
      waveTimer=tutorialMode?0.8:0.5-Math.min(0.3,wave*0.01);
    } else if(enemies.length===0){
      if(bossTrig) spawnBoss(wave);
      else {wave++; enemiesInWave=0; announceWave(tutorialMode?`敵撃破: ${tutorialKills}/20`:`WAVE ${wave}`); waveTimer=1;}
    }
  }

  bullets=bullets.filter(b=>{
    if(b.homing){
      if(!b.target||b.target.hp<=0) b.target=enemies.find(e=>!e.isBoss&&e.hp>0);
      if(b.target){const dx=b.target.x-b.x, dy=b.target.y-b.y, d=Math.hypot(dx,dy); if(d>10){b.vx=dx/d*550; b.vy=dy/d*550;}}
    }
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    return b.life>0&&b.y>-30&&b.y<H+30&&b.x>-30&&b.x<W+30;
  });

  ebullets=ebullets.filter(b=>{
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    const pdx=b.x-player.x, pdy=b.y-player.y;
    if(Math.sqrt(pdx*pdx+pdy*pdy)<16) {damagePlayer(10); return false;}
    return b.life>0&&b.y>-30&&b.y<H+50&&b.x>-30&&b.x<W+30;
  });

  enemies=enemies.filter(e=>{
    if(e.isBoss){
      if(e.y<e.targetY) e.y+=e.speed*dt;
      else {e.x+=Math.sin(Date.now()*0.001)*90*dt*e.moveDir; if(e.x<W*0.12) e.moveDir=1; if(e.x>W*0.88) e.moveDir=-1;}
      e.fireTimer-=dt;
      e.phaseTimer=(e.phaseTimer||0)+dt;
      if(e.fireTimer<=0){
        const patt=Math.floor(e.phaseTimer/2.5)%4;
        if(patt===0){for(let i=-4;i<=4;i++) spawnBullet(e.x,e.y+e.size,Math.PI/2+i*0.12,220,true,'#ff4400'); e.fireTimer=0.5;}
        else if(patt===1){const a=Math.atan2(player.y-e.y,player.x-e.x); for(let i=-2;i<=2;i++) spawnBullet(e.x,e.y+e.size,a+i*0.15,300,true,'#ff00ff'); e.fireTimer=0.4;}
        else if(patt===2){const a=e.phaseTimer*2.5; spawnBullet(e.x,e.y,a,200,true,'#ffff00'); spawnBullet(e.x,e.y,a+Math.PI,200,true,'#ffff00'); e.fireTimer=0.1;}
        else {for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2; spawnBullet(e.x,e.y+e.size/2,a,180,true,'#ff88ff');} e.fireTimer=0.8;}
        if(e.isMegaBoss){for(let i=0;i<20;i++){const a=(i/20)*Math.PI*2; spawnBullet(e.x,e.y+e.size,a,300,true,'#ff00aa');}}
      }
    } else {
      e.y+=e.speed*dt;
      e.fireTimer=(e.fireTimer||0)-dt;
      const fireChance=tutorialMode?0:wave<11?0.12:wave<31?0.22:wave<61?0.32:0.38;
      if(e.fireTimer<=0&&Math.random()<fireChance){
        const patt=e.pattern||0;
        if(patt===0){const a=Math.atan2(player.y-e.y,player.x-e.x); spawnBullet(e.x,e.y,a,190,true);}
        else if(patt===1){for(let i=-1;i<=1;i++) spawnBullet(e.x,e.y,Math.PI/2+i*0.2,170,true,'#ffaa00');}
        else {const a=Math.atan2(player.y-e.y,player.x-e.x); for(let i=0;i<3;i++){const sa=a+(i-1)*0.15; spawnBullet(e.x,e.y,sa,210,true,'#ff00ff');}}
        e.fireTimer=1.4-Math.min(0.7,wave*0.04);
      }
    }

    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      const ddx=b.x-e.x, ddy=b.y-e.y;
      if(Math.sqrt(ddx*ddx+ddy*ddy)<e.size*0.6+b.size){
        let dmg=lvl.dmg*diffMult.playerDmg;
        e.hp-=dmg; bullets.splice(i,1); spawnExp(b.x,b.y,'#0cf',4);
        if(e.hp<=0){
          spawnExp(e.x,e.y,e.isBoss?'#ff6600':'#ffaa00',e.isBoss?25:8);
          const cMult=1+combo*0.15;
          score+=Math.floor((e.score||100)*cMult);
          addCombo();
          const coinCnt=e.isBoss?15:(e.type==='tank'?4:2);
          const medalCnt=e.isBoss?5:(e.type==='tank'?2:1);
          const pieceCnt=e.isBoss?20:(e.type==='tank'?8:4);
          for(let c=0;c<coinCnt;c++) spawnCoin(e.x+(Math.random()-0.5)*40,e.y,false);
          for(let c=0;c<medalCnt;c++) spawnCoin(e.x+(Math.random()-0.5)*40,e.y,true);
          for(let c=0;c<pieceCnt;c++) spawnPiece(e.x+(Math.random()-0.5)*40,e.y);
          if(!tutorialMode&&(e.isBoss||(Math.random()<0.28*(1+dropUpActive*0.1)))) spawnPowerup(e.x,e.y);
          if(e.isBoss){bossActive=false; boss=null; document.getElementById('bossHpContainer').style.display='none'; wave++; enemiesInWave=0; announceWave(`WAVE ${wave}`); waveTimer=1.5;}
          addOrbs(e.isBoss?5:1);
          if(tutorialMode) tutorialKills++;
          enemiesKilled++;
          return false;
        }
        break;
      }
    }

    if(!e.isBoss||e.y>=e.targetY){const pdx=e.x-player.x, pdy=e.y-player.y; if(Math.sqrt(pdx*pdx+pdy*pdy)<e.size+12) damagePlayer(e.isBoss?28:18);}
    if(!e.isBoss&&e.y>H+60){livesCurrent=Math.max(0,livesCurrent-10); if(livesCurrent<=0) gameOver(); return false;}
    return true;
  });

  coins_obj=coins_obj.filter(c=>{
    c.x+=c.vx*dt; c.y+=c.vy*dt; c.vy+=120*dt; c.life-=dt;
    const dx=player.x-c.x, dy=player.y-c.y, d=Math.sqrt(dx*dx+dy*dy);
    if(d<400){const sp=700; c.x+=(dx/d)*sp*dt; c.y+=(dy/d)*sp*dt;}
    if(d<30){
      if(c.isMedal){gameMedals+=c.value||1;} 
      else if(c.isPiece){const cMult=1+combo*0.15; pieces+=c.value; score+=Math.floor(c.value*5*(1+combo*0.05));}
      else{const cMult=1+combo*0.15; gameCoins+=c.value; score+=Math.floor(c.value*12*(1+combo*0.1));}
      return false;
    }
    return c.life>0;
  });

  powerups=powerups.filter(p=>{
    p.y+=p.vy*dt; p.life-=dt;
    const dx=p.x-player.x, dy=p.y-player.y;
    if(Math.sqrt(dx*dx+dy*dy)<35){const es=items.indexOf(null); if(es>=0){items[es]=p.type; updateItemUI();} return false;}
    return p.life>0&&p.y<H+40;
  });

  particles=particles.filter(p=>{p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; return p.life>0;});

  updateHUD();
  const ind=document.getElementById('skillIndicator');
  if(dropUpActive>0){ind.textContent='🌟 DROP UP'; ind.style.opacity='1';}
  else ind.style.opacity='0';

  if(tutorialMode){
    document.getElementById('tutorialKillCount').textContent=tutorialKills;
    if(tutorialPhase===0&&tutorialKills>=2){
      tutorialPhase=1;
      showTutorialTip('📖 移動成功!', 'ピースを集めると右下のスキルが使えます。コインとメダルはゲーム終了後に保存されます。');
    }
    if(tutorialPhase===1&&tutorialKills>=5){
      tutorialPhase=2;
      showTutorialTip('💥 スキルを使ってみよう!', 'C、V、B、N キーでスキルが使えます。ピースを消費するので注意！');
    }
    if(tutorialKills>=20) endTutorialSuccess();
  }
}

function render(){
  ctx.clearRect(0,0,W,H);
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#000510');
  bg.addColorStop(0.5,'#000a18');
  bg.addColorStop(1,'#001030');
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,W,H);
  drawStars(); drawTunnel();
  coins_obj.forEach(drawCoin);
  powerups.forEach(drawPowerup);
  bullets.forEach(drawBullet);
  ebullets.forEach(drawBullet);
  enemies.forEach(drawEnemy);
  particles.forEach(drawParticle);
  if(gameRunning) drawPlayer();
}

function gameLoop(time){
  dt=Math.min(0.033,(time-lastTime)/1000);
  lastTime=time;
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function selectDifficulty(){
  document.getElementById('homeScreen').style.display='none';
  document.getElementById('difficultySelect').style.display='block';
}

function cancelDifficulty(){
  document.getElementById('difficultySelect').style.display='none';
  document.getElementById('homeScreen').style.display='block';
}

function startGameWithDifficulty(d){
  const nick=document.getElementById('nicknameInput').value.trim();
  if(nick) playerData.nickname=nick;
  savePlayerData();
  
  difficulty=d;
  setDifficultyMultipliers();
  document.getElementById('difficultySelect').style.display='none';
  startGame();
}

function setDifficultyMultipliers(){
  if(difficulty==='easy'){
    diffMult={playerMaxHP:1.5, playerDmg:0.5, enemySpeed:0.7, bulletSpeed:1, bossHP:1, lives:2, expMult:0.8, coinMult:0.8, enemyBulletSpeed:0.8, fireRate:0.8};
  } else if(difficulty==='normal'){
    diffMult={playerMaxHP:1, playerDmg:1, enemySpeed:1, bulletSpeed:1, bossHP:1, lives:1, expMult:1, coinMult:1, enemyBulletSpeed:1, fireRate:1};
  } else if(difficulty==='hard'){
    diffMult={playerMaxHP:0.8, playerDmg:1.5, enemySpeed:1.2, bulletSpeed:1, bossHP:1, lives:0.5, expMult:1.2, coinMult:1.2, enemyBulletSpeed:1, fireRate:0.9};
  } else if(difficulty==='expert'){
    diffMult={playerMaxHP:0.7, playerDmg:0.5, enemySpeed:1.2, bulletSpeed:0.8, bossHP:1.2, lives:0.5, expMult:2, coinMult:2, enemyBulletSpeed:1, fireRate:0.8};
  } else if(difficulty==='nightmare'){
    diffMult={playerMaxHP:0.5, playerDmg:0.5, enemySpeed:1.2, bulletSpeed:0.8, bossHP:1.5, lives:1/3, expMult:3, coinMult:5, enemyBulletSpeed:1, fireRate:1.5};
  }
}

function showShop(){
  document.getElementById('homeScreen').style.display='none';
  document.getElementById('shopScreen').style.display='block';
  document.getElementById('shopCoinDisplay').textContent=`🪙 ${playerData.coins}`;
}

function hideShop(){
  document.getElementById('shopScreen').style.display='none';
  document.getElementById('homeScreen').style.display='block';
  updateHomeDisplay();
}

function buyShopItem(item){
  if(item==='heal_up' && playerData.coins>=50){
    playerData.coins-=50;
    playerHP=Math.min(playerMaxHP, playerHP+50);
  } else if(item==='max_lives' && playerData.coins>=100){
    playerData.coins-=100;
    livesMax+=20;
    livesCurrent+=20;
  } else if(item==='damage_up' && playerData.coins>=150){
    playerData.coins-=150;
    damageMultiplier+=1;
    lvl.shots=Math.min(5, lvl.shots+1);
  } else if(item==='fire_rate_up' && playerData.coins>=150){
    playerData.coins-=150;
    fireRateMultiplier+=0.5;
  }
  savePlayerData();
  document.getElementById('shopCoinDisplay').textContent=`🪙 ${playerData.coins}`;
}

function showControls(){
  document.getElementById('controlsOverlay').style.display='flex';
}

function closeControls(){
  document.getElementById('controlsOverlay').style.display='none';
}

function showTutorialStart(){
  const box=document.getElementById('tutorialOverlay');
  const desc=document.getElementById('tutorialPhaseDesc');
  desc.textContent='敵を 20 体倒すとクリア！操作しながら敵を倒して習得しよう。';
  box.style.display='flex';
}

function skipTutorial(){
  document.getElementById('tutorialOverlay').style.display='none';
}

function startTutorial(){
  tutorialMode=true;
  tutorialKills=0;
  tutorialPhase=0;
  document.getElementById('tutorialOverlay').style.display='none';
  difficulty='normal';
  setDifficultyMultipliers();
  startGame();
}

function endTutorialSuccess(){
  if(tutorialMode){
    tutorialMode=false;
    gameRunning=false;
    document.getElementById('gameOverScreen').style.display='flex';
    document.getElementById('gameOverTitle').textContent='TUTORIAL SUCCESS!';
    document.getElementById('finalScore').textContent=`敵撃破数: ${tutorialKills}`;
    document.getElementById('finalStats').textContent='基本操作をマスターしました！もう本ゲームをプレイできます。';
    setTimeout(()=>{
      document.getElementById('gameOverTitle').style.opacity='1';
      document.getElementById('finalScore').style.opacity='1';
      document.getElementById('finalStats').style.opacity='1';
      document.getElementById('gameOverButtons').style.opacity='1';
    }, 100);
  }
}

function startGame(){
  score=0; gameCoins=0; gameMedals=0; pieces=0; combo=0; comboTimer=0; maxCombo=0;
  wave=1; waveTimer=1; enemiesInWave=0;
  playerMaxHP = 100 * diffMult.playerMaxHP;
  playerHP = playerMaxHP;
  livesMax = 50 * diffMult.lives;
  livesCurrent = livesMax;
  moveLevel=1; orbs=0; orbsTarget=30; dropUpActive=0;
  bossActive=false; boss=null;
  skillUses=0; itemUses=0; enemiesKilled=0;
  bullets=[]; enemies=[]; particles=[]; coins_obj=[]; powerups=[]; ebullets=[];
  items=[
    ITEMS.find(i=>i.id==='bomb'),
    ITEMS.find(i=>i.id==='heal'),
    ITEMS.find(i=>i.id==='heal'),
    null,
    null
  ];
  lvl={speed:1,fire:1,size:1,shots:1,hp:0,comboT:3,dmg:1};
  damageMultiplier=1;
  fireRateMultiplier=1;
  player={x:cx,y:H*0.78,speed:280,fireRate:0.12,fireTimer:0,invincible:0,shield:false,rapidFire:0,spread:0};
  initStars();
  updateItemUI();
  updateHUD();
  document.getElementById('homeScreen').style.display='none';
  document.getElementById('shopScreen').style.display='none';
  document.getElementById('gameOverScreen').style.display='none';
  document.getElementById('inGameHUD').style.display='flex';
  document.getElementById('inGameHUDRight').style.display='flex';
  document.getElementById('itemSlots').style.display='flex';
  document.getElementById('skillBar').style.display='flex';
  document.getElementById('bossHpContainer').style.display='none';
  document.getElementById('levelUpPopup').style.opacity='0';
  gameRunning=true;
  if(tutorialMode) showTutorialTip('【TUTORIAL】敵を倒す', '敵を射撃して倒してみよう！スペースキーまたはマウスクリックで射撃できます。');
  announceWave(tutorialMode?'TUTORIAL START!':'WAVE 1 START!');
}

function gameOver(){
  gameRunning=false;
  if(!tutorialMode){
    const mult = getScoreMultiplier();
    const baseScore = Math.floor(score);
    const bonusScore = Math.floor(score * mult) - baseScore;
    const finalScore = Math.floor(score * mult);
    
    if(finalScore > playerData.highScore) playerData.highScore = finalScore;
    playerData.coins += gameCoins;
    playerData.medals += gameMedals;
    
    const gameExp = calculateGameExp();
    addPlayerExp(gameExp);
    addToRankings(score);
  }
  savePlayerData();
  
  const goScreen = document.getElementById('gameOverScreen');
  goScreen.style.display='flex';
  
  // Reset opacity
  document.getElementById('gameOverTitle').style.opacity='0';
  document.getElementById('finalScore').style.opacity='0';
  document.getElementById('gameOverRanking').style.opacity='0';
  document.getElementById('finalStats').style.opacity='0';
  document.getElementById('gameOverButtons').style.opacity='0';
  
  if(tutorialMode){
    document.getElementById('gameOverTitle').textContent='GAME OVER';
    document.getElementById('totalScore').textContent=`敵撃破数: ${tutorialKills} / 20`;
    document.getElementById('baseScoreText').parentElement.style.display='none';
    document.getElementById('bonusMultText').parentElement.style.display='none';
    document.getElementById('bonusScoreText').parentElement.style.display='none';
    document.getElementById('finalStats').textContent='基本操作をマスターしました！もう本ゲームをプレイできます。';
    document.getElementById('gameOverRanking').style.display='none';
  } else {
    const mult = getScoreMultiplier();
    const baseScore = Math.floor(score);
    const bonusScore = Math.floor(score * mult) - baseScore;
    const finalScore = Math.floor(score * mult);
    
    document.getElementById('totalScore').textContent=`SCORE: ${finalScore.toLocaleString()}`;
    document.getElementById('baseScoreText').textContent=baseScore.toLocaleString();
    document.getElementById('bonusMultText').textContent=`×${mult.toFixed(1)}`;
    document.getElementById('bonusScoreText').textContent=`+${bonusScore.toLocaleString()}`;
    document.getElementById('baseScoreText').parentElement.style.display='block';
    document.getElementById('bonusMultText').parentElement.style.display='block';
    document.getElementById('bonusScoreText').parentElement.style.display='block';
    
    showGameOverRanking();
    document.getElementById('gameOverRanking').style.display='block';
    
    const gameExp = calculateGameExp();
    document.getElementById('finalStats').textContent=`+${gameCoins}🪙 | +${gameMedals}🔘 | +${gameExp}EXP | ムーブ${moveLevel} | WAVE${wave} | ${maxCombo}xCOMBO`;
  }
  
  // Animate in sequence
  setTimeout(()=>document.getElementById('gameOverTitle').style.opacity='1', 100);
  setTimeout(()=>document.getElementById('finalScore').style.opacity='1', 600);
  setTimeout(()=>document.getElementById('gameOverRanking').style.opacity='1', 1100);
  setTimeout(()=>document.getElementById('finalStats').style.opacity='1', 1600);
  setTimeout(()=>document.getElementById('gameOverButtons').style.opacity='1', 2100);
  
  document.getElementById('inGameHUD').style.display='none';
  document.getElementById('inGameHUDRight').style.display='none';
  document.getElementById('itemSlots').style.display='none';
  document.getElementById('skillBar').style.display='none';
}

function goHome(){
  document.getElementById('gameOverScreen').style.display='none';
  document.getElementById('homeScreen').style.display='block';
  document.getElementById('nicknameInput').value=playerData.nickname;
  updateHomeDisplay();
  updateHUD();
}

function retryGame(){
  document.getElementById('gameOverScreen').style.display='none';
  selectDifficulty();
}

// Initialize
document.getElementById('nicknameInput').value=playerData.nickname;
updateHomeDisplay();
initStars();
updateItemUI();
updateHUD();
lastTime=performance.now();
requestAnimationFrame(gameLoop);

// ===== アップデート確認処理 =====
const GAME_VERSION = "1.0.1";
const VERSION_JSON_ID = "19O50aJpZ7d3wWbgEyg2VNNv5LySYCLtV";

function checkForUpdates() {
  const driveUrl = `https://drive.google.com/uc?export=download&id=19O50aJpZ7d3wWbgEyg2VNNv5LySYCLtV`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(driveUrl)}`;
  
  fetch(proxyUrl)
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then(data => {
      console.log("📦 バージョン情報を取得:", data);
      
      if (compareVersions(data.version, GAME_VERSION) > 0) {
        displayUpdateNotification(data);
      } else {
        console.info("✅ 最新バージョンを使用中:", GAME_VERSION);
      }
    })
    .catch(err => {
      console.warn("⚠️ バージョンチェック失敗 (ゲームは正常に動作します):", err.message);
    });
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function displayUpdateNotification(data) {
  const updateBox = document.createElement("div");
  updateBox.id = "updateNotification";
  updateBox.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0,0,0,0.95);
    color: #0ff;
    padding: 18px 22px;
    border: 2px solid #0ff;
    border-radius: 8px;
    font-family: Orbitron, monospace;
    z-index: 9999;
    max-width: 340px;
    box-shadow: 0 0 25px rgba(0,255,255,0.6);
    animation: slideInRight 0.5s ease-out;
  `;
  
  const changesList = data.changes 
    ? data.changes.map(c => `<div style="font-size:9px;color:#aaa;margin-left:10px">• ${c}</div>`).join('')
    : '';
  
  updateBox.innerHTML = `
    <div style="font-size:15px;font-weight:900;margin-bottom:10px;color:#ff0;text-shadow:0 0 10px #ff0">
      🔔 新バージョン ${data.version} 公開！
    </div>
    <div style="font-size:11px;margin-bottom:8px;color:#fff;line-height:1.6">
      ${data.message}
    </div>
    ${changesList}
    <div style="font-size:9px;color:#666;margin:10px 0 12px 0">
      📅 ${data.release_date}
    </div>
    <a href="${data.download_url}" target="_blank" 
       style="display:block;background:linear-gradient(135deg,#0ff,#0af);color:#000;padding:12px;text-align:center;text-decoration:none;border-radius:5px;font-weight:900;font-size:13px;margin-bottom:8px;transition:all 0.2s;letter-spacing:1px"
       onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 0 15px #0ff'"
       onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none'">
      📥 今すぐダウンロード
    </a>
    <button onclick="this.parentElement.remove()" 
            style="background:transparent;border:1px solid #555;color:#888;padding:8px;width:100%;border-radius:4px;cursor:pointer;font-size:10px;transition:all 0.2s"
            onmouseover="this.style.borderColor='#0ff';this.style.color='#0ff'"
            onmouseout="this.style.borderColor='#555';this.style.color='#888'">
      後で確認する
    </button>
  `;
  
  document.body.appendChild(updateBox);
}

// アニメーション用CSS追加
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

// ページ読み込み後にチェック実行
window.addEventListener('load', () => {
  setTimeout(checkForUpdates, 1000); // 1秒後にチェック
});

// お知らせ機能
const LATEST_NEWS_VERSION = "1.0.1"; // 最新のお知らせバージョン


function checkNewsStatus(){
  const lastReadVersion = localStorage.getItem('lastReadNewsVersion');
  const badge = document.getElementById('newsNewBadge');
  
  if(lastReadVersion !== LATEST_NEWS_VERSION && badge){
    badge.style.display = 'block';
  } else if(badge) {
    badge.style.display = 'none';
  }
}

function showNewsOverlay(){
  document.getElementById('newsOverlay').style.display = 'flex';
  
  // お知らせを既読にする
  localStorage.setItem('lastReadNewsVersion', LATEST_NEWS_VERSION);
  const badge = document.getElementById('newsNewBadge');
  if(badge) badge.style.display = 'none';
}

function closeNewsOverlay(){
  document.getElementById('newsOverlay').style.display = 'none';
}

// 初期化時にお知らせの状態をチェック
checkNewsStatus();
