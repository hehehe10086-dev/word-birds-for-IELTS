// ===== Word Birds: INTERACTIVE DICTIONARY EDITION =====

const ALL_WORDS = (window.WORDS || []).slice().sort(
  (a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase())
);

if (!ALL_WORDS || ALL_WORDS.length < 10) {
  alert("词库太少！请检查 words.js 是否正确加载。");
}

// ══════════════════════════════════════════════════════════
//  USER MANAGER — localStorage per-user persistence
// ══════════════════════════════════════════════════════════
const UserManager = {
  currentUser: null,

  _key() { return "wb_user_" + this.currentUser; },

  login(username) {
    this.currentUser = username.trim().toLowerCase();
    if (!localStorage.getItem(this._key())) {
      localStorage.setItem(this._key(), JSON.stringify({
        wordData: {},     // { word: { selected, correctFirst, mistakes, mastered } }
        created: Date.now()
      }));
    }
  },

  logout() { this.currentUser = null; },

  load() {
    try { return JSON.parse(localStorage.getItem(this._key())) || { wordData: {} }; }
    catch(e) { return { wordData: {} }; }
  },

  save(data) {
    try { localStorage.setItem(this._key(), JSON.stringify(data)); } catch(e) {}
  },

  getWordData(word) {
    const d = this.load().wordData[word];
    return d || { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
  },

  setWordSelected(word, selected) {
    const data = this.load();
    if (!data.wordData[word]) data.wordData[word] = { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
    data.wordData[word].selected = selected;
    this.save(data);
  },

  batchSetSelected(words, selected) {
    const data = this.load();
    words.forEach(w => {
      if (!data.wordData[w]) data.wordData[w] = { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
      data.wordData[w].selected = selected;
    });
    this.save(data);
  },

  recordCorrectFirst(word) {
    const data = this.load();
    if (!data.wordData[word]) data.wordData[word] = { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
    data.wordData[word].correctFirst++;
    // mastered = answered correctly first-try at least once
    data.wordData[word].mastered = true;
    this.save(data);
  },

  recordMistake(word) {
    const data = this.load();
    if (!data.wordData[word]) data.wordData[word] = { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
    data.wordData[word].mistakes++;
    // un-master: needs to answer correctly first-try again
    data.wordData[word].mastered = false;
    this.save(data);
  },

  getSelectedWords() {
    const data = this.load();
    return ALL_WORDS.filter(w => data.wordData[w.word]?.selected);
  },

  getAllWordData() { return this.load().wordData; }
};


// ══════════════════════════════════════════════════════════
//  DICTIONARY UI
// ══════════════════════════════════════════════════════════
const DictUI = {
  filter: "all",       // "all" | "checked" | "wrong" | "mastered"
  searchTerm: "",
  renderedWords: [],

  init() {
    this.els = {
      body:       document.getElementById("dictBody"),
      search:     document.getElementById("dictSearch"),
      stats:      document.getElementById("dictStats"),
      startBtn:   document.getElementById("startGameBtn"),
      letterNav:  document.getElementById("letterNav"),
      filterAll:  document.getElementById("filterAll"),
      filterChecked:   document.getElementById("filterChecked"),
      filterWrong:     document.getElementById("filterWrong"),
      filterMastered:  document.getElementById("filterMastered"),
      selectAllBtn:    document.getElementById("selectAllVisible"),
      deselectAllBtn:  document.getElementById("deselectAll"),
    };

    // Search
    this.els.search.addEventListener("input", () => {
      this.searchTerm = this.els.search.value.trim().toLowerCase();
      this.render();
    });

    // Filters
    const setFilter = (f) => {
      this.filter = f;
      this.updateFilterBtns();
      this.render();
    };
    this.els.filterAll.addEventListener("click",     () => setFilter("all"));
    this.els.filterChecked.addEventListener("click",  () => setFilter("checked"));
    this.els.filterWrong.addEventListener("click",    () => setFilter("wrong"));
    this.els.filterMastered.addEventListener("click", () => setFilter("mastered"));

    // Select all visible
    this.els.selectAllBtn.addEventListener("click", () => {
      const words = this.renderedWords.filter(w => !w._isMastered).map(w => w.word);
      UserManager.batchSetSelected(words, true);
      this.render();
    });

    // Deselect all
    this.els.deselectAllBtn.addEventListener("click", () => {
      const allWords = ALL_WORDS.map(w => w.word);
      UserManager.batchSetSelected(allWords, false);
      this.render();
    });

    this.buildLetterNav();
    this.updateFilterBtns();
  },

  updateFilterBtns() {
    [this.els.filterAll, this.els.filterChecked, this.els.filterWrong, this.els.filterMastered].forEach(b => b.classList.remove("active"));
    ({
      all:      this.els.filterAll,
      checked:  this.els.filterChecked,
      wrong:    this.els.filterWrong,
      mastered: this.els.filterMastered,
    })[this.filter]?.classList.add("active");
  },

  buildLetterNav() {
    const letters = new Set(ALL_WORDS.map(w => w.word[0].toUpperCase()));
    this.els.letterNav.innerHTML = "";
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const btn = document.createElement("button");
      btn.className = "letter-btn" + (letters.has(letter) ? " has-words" : "");
      btn.textContent = letter;
      btn.addEventListener("click", () => {
        const target = document.getElementById("letter-" + letter);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      this.els.letterNav.appendChild(btn);
    }
  },

  getFilteredWords() {
    const userData = UserManager.getAllWordData();
    let words = ALL_WORDS.map(w => {
      const d = userData[w.word] || {};
      return {
        ...w,
        _selected: !!d.selected,
        _mastered: !!d.mastered,
        _mistakes: d.mistakes || 0,
        _correctFirst: d.correctFirst || 0,
      };
    });

    // Apply search
    if (this.searchTerm) {
      words = words.filter(w =>
        w.word.toLowerCase().includes(this.searchTerm) ||
        w.meaning.includes(this.searchTerm)
      );
    }

    // Apply filter
    if (this.filter === "checked")  words = words.filter(w => w._selected);
    if (this.filter === "wrong")    words = words.filter(w => w._mistakes > 0 && !w._mastered);
    if (this.filter === "mastered") words = words.filter(w => w._mastered);

    // Sort: non-mastered first (alphabetical), then mastered at bottom (alphabetical)
    const active   = words.filter(w => !w._mastered);
    const mastered = words.filter(w => w._mastered);

    return { active, mastered };
  },

  render() {
    const { active, mastered } = this.getFilteredWords();
    this.renderedWords = [...active, ...mastered];

    // Update stats
    const selectedCount = ALL_WORDS.filter(w => {
      const d = UserManager.getWordData(w.word);
      return d.selected;
    }).length;
    const masteredCount = ALL_WORDS.filter(w => UserManager.getWordData(w.word).mastered).length;
    this.els.stats.textContent = `已选 ${selectedCount} 词 · 已掌握 ${masteredCount} 词 · 共 ${ALL_WORDS.length} 词`;
    this.els.startBtn.disabled = selectedCount < 3;

    // Build HTML
    const html = [];
    let currentLetter = "";

    // Active words
    active.forEach(w => {
      const firstLetter = w.word[0].toUpperCase();
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        html.push(`<div class="letter-group" id="letter-${firstLetter}">${firstLetter}</div>`);
      }
      html.push(this.wordRowHTML(w));
    });

    // Mastered section
    if (mastered.length > 0) {
      html.push(`<div class="mastered-divider">✅ 已掌握 (${mastered.length} 词) — 一次答对后移至此处</div>`);
      currentLetter = "";
      mastered.forEach(w => {
        const firstLetter = w.word[0].toUpperCase();
        if (firstLetter !== currentLetter) {
          currentLetter = firstLetter;
          html.push(`<div class="letter-group" id="letter-m-${firstLetter}">${firstLetter}</div>`);
        }
        html.push(this.wordRowHTML(w, true));
      });
    }

    if (html.length === 0) {
      html.push(`<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">没有找到词语</div>`);
    }

    this.els.body.innerHTML = html.join("");

    // Bind click events using delegation
    this.els.body.onclick = (e) => {
      const row = e.target.closest(".word-row");
      if (!row) return;
      const word = row.dataset.word;
      if (!word) return;
      const d = UserManager.getWordData(word);
      UserManager.setWordSelected(word, !d.selected);
      this.render();
    };
  },

  wordRowHTML(w, isMastered = false) {
    const checkedClass = w._selected ? " checked" : "";
    const masteredClass = isMastered ? " mastered-row" : "";
    let statusHTML = "";
    if (w._mastered) {
      statusHTML = `<span class="word-status status-mastered">已掌握</span>`;
    } else if (w._mistakes > 0) {
      statusHTML = `<span class="word-status status-wrong">错${w._mistakes}次</span>`;
    }
    return `<div class="word-row${checkedClass}${masteredClass}" data-word="${w.word}">
      <div class="word-check">${w._selected ? "✓" : ""}</div>
      <div class="word-info">
        <div class="word-en">${w.word}</div>
        <div class="word-cn">${w.meaning}</div>
      </div>
      ${statusHTML}
    </div>`;
  }
};


// ══════════════════════════════════════════════════════════
//  SESSION TRACKER — tracks per-game-session results
// ══════════════════════════════════════════════════════════
const Session = {
  results: [],        // { word, meaning, correct: boolean }
  active: false,

  start() {
    this.results = [];
    this.active = true;
  },

  record(word, meaning, correct) {
    // Only record the first encounter of each word in a session
    if (this.results.find(r => r.word === word)) return;
    this.results.push({ word, meaning, correct });

    if (correct) {
      UserManager.recordCorrectFirst(word);
    } else {
      UserManager.recordMistake(word);
    }
  },

  getReport() {
    const correctWords = this.results.filter(r => r.correct);
    const wrongWords   = this.results.filter(r => !r.correct);
    return {
      total:   this.results.length,
      correct: correctWords,
      wrong:   wrongWords
    };
  }
};


// ══════════════════════════════════════════════════════════
//  SCREEN MANAGER
// ══════════════════════════════════════════════════════════
const Screens = {
  show(id) {
    ["loginScreen","dictScreen","resultsScreen"].forEach(s => {
      document.getElementById(s).classList.toggle("hidden", s !== id);
    });
    document.getElementById("wrap").style.display = (id === "game") ? "block" : "none";
  },

  showGame() {
    ["loginScreen","dictScreen","resultsScreen"].forEach(s => {
      document.getElementById(s).classList.add("hidden");
    });
    document.getElementById("wrap").style.display = "block";
  },

  showResults() {
    const report = Session.getReport();
    document.getElementById("rTotal").textContent   = report.total;
    document.getElementById("rCorrect").textContent = report.correct.length;
    document.getElementById("rWrong").textContent   = report.wrong.length;

    const correctList = document.getElementById("rCorrectList");
    const wrongList   = document.getElementById("rWrongList");
    correctList.innerHTML = report.correct.map(r =>
      `<span class="results-word-tag tag-correct">${r.word}</span>`
    ).join("") || `<span style="color:var(--text-muted);font-size:13px;">无</span>`;
    wrongList.innerHTML = report.wrong.map(r =>
      `<span class="results-word-tag tag-wrong">${r.word}</span>`
    ).join("") || `<span style="color:var(--text-muted);font-size:13px;">无</span>`;

    document.getElementById("rCorrectSection").style.display = report.correct.length ? "" : "none";
    document.getElementById("rWrongSection").style.display   = report.wrong.length ? "" : "none";

    this.show("resultsScreen");
  }
};


// ══════════════════════════════════════════════════════════
//  GAME WORD POOL — replaces the old random-from-all logic
// ══════════════════════════════════════════════════════════
let GAME_WORDS = [];         // the words for this game session
const MASTERED     = new Set();
const CORRECT_CNT  = {};
const REVENGE_POOL = [];

function initGamePool() {
  GAME_WORDS = UserManager.getSelectedWords();
  MASTERED.clear();
  for (const k in CORRECT_CNT) delete CORRECT_CNT[k];
  REVENGE_POOL.length = 0;
}

function markCorrect(wordObj) {
  const w = wordObj.word;
  CORRECT_CNT[w] = (CORRECT_CNT[w] || 0) + 1;
  if (CORRECT_CNT[w] >= 2) {
    MASTERED.add(w);
    const idx = REVENGE_POOL.findIndex(r => r.word === w);
    if (idx >= 0) REVENGE_POOL.splice(idx, 1);
  }
}

function addToRevenge(wordObj) {
  if (MASTERED.has(wordObj.word)) return;
  const ex = REVENGE_POOL.find(r => r.word === wordObj.word);
  if (ex) {
    ex.immediate = Math.max(ex.immediate, 2);
    ex.totalLeft = Math.max(ex.totalLeft, 7);
  } else {
    REVENGE_POOL.push({ word: wordObj.word, meaning: wordObj.meaning,
      immediate: 2, questionsSince: 0, totalLeft: 7 });
  }
}

function tickRevenge() {
  REVENGE_POOL.forEach(r => { if (r.immediate === 0) r.questionsSince++; });
}

function pickCorrectWord() {
  // Priority 1: immediate revenge
  const imIdx = REVENGE_POOL.findIndex(r => r.immediate > 0);
  if (imIdx >= 0) {
    const r = REVENGE_POOL[imIdx];
    r.immediate--; r.totalLeft--;
    if (r.totalLeft <= 0) REVENGE_POOL.splice(imIdx, 1);
    return { word: r.word, meaning: r.meaning };
  }
  // Priority 2: spaced revenge
  const spIdx = REVENGE_POOL.findIndex(r => r.immediate === 0 && r.questionsSince >= 5);
  if (spIdx >= 0) {
    const r = REVENGE_POOL[spIdx];
    r.questionsSince = 0; r.totalLeft--;
    if (r.totalLeft <= 0) REVENGE_POOL.splice(spIdx, 1);
    return { word: r.word, meaning: r.meaning };
  }
  // Normal: from selected words, excluding mastered
  const pool = GAME_WORDS.filter(w => !MASTERED.has(w.word));
  if (pool.length > 0) return Phaser.Utils.Array.GetRandom(pool);
  // All mastered — pick from all game words
  return GAME_WORDS.length > 0
    ? Phaser.Utils.Array.GetRandom(GAME_WORDS)
    : Phaser.Utils.Array.GetRandom(ALL_WORDS);
}


// ══════════════════════════════════════════════════════════
//  GAME ENGINE (Phaser) — mostly unchanged from original
// ══════════════════════════════════════════════════════════
const W = 1100, H = 620;
function shuffle(arr) { return Phaser.Utils.Array.Shuffle(arr.slice()); }
function randPick(arr) { return Phaser.Utils.Array.GetRandom(arr); }

function makeQuestion() {
  tickRevenge();
  const correct = pickCorrectWord();
  // Wrong options: prefer from game words, fallback to all
  const wrongSource = GAME_WORDS.length > 6 ? GAME_WORDS : ALL_WORDS;
  const wrongPool = wrongSource.filter(w => w.word !== correct.word);
  const w1 = randPick(wrongPool);
  const w2 = randPick(wrongPool.filter(x => x.word !== w1.word));
  return { correct, choices: shuffle([
    { text: correct.meaning, ok: true  },
    { text: w1.meaning,      ok: false },
    { text: w2.meaning,      ok: false }
  ])};
}

function safeResumeAudio(scene) {
  try { const c = scene.sound?.context; if (c?.state==="suspended") c.resume(); } catch(e) {}
}
function beep(scene, freq=880, dur=0.08, type="sine", vol=0.05) {
  try {
    const ctx = scene.sound?.context; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=vol;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+dur);
  } catch(e) {}
}


class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  create() {
    this.physics.world.setBounds(0, 0, W, H);

    this.roundId=0; this.roundFinished=false; this.launched=false;
    this.dragging=false; this.skillUsed=false;
    this.studyMode=false; this.studyPreviewing=false;

    this.score=0; this.streak=0; this.questionCount=0;
    this.level=1; this.levelQ=0;
    this.timeLeft=10; this.timerActive=false;

    this.birdCycle=["RED","BLUE","BLACK","GREEN","YELLOW","ORANGE","PURPLE"];
    this.birdIndex=-1; this.birdType="RED";

    this.MAX_PULL=260; this.POWER=15.5; this.GRAVITY_Y=400; this.DRAG_SMOOTH=0.18;

    this.bgPalette=["#87ceeb","#b8f0b8","#fff4c2","#ffd4b8","#ffb3cf","#d4b8ff"];
    this.cameras.main.setBackgroundColor(this.bgPalette[0]);

    this.drawSky();
    this.spawnClouds();

    this.add.rectangle(W/2, H-8, W, 30, 0x4a7c2f);
    this.add.rectangle(W/2, H-22, W, 16, 0x6abf45);
    this.ground = this.add.rectangle(W/2, H-8, W, 30, 0x5a4a2a, 0);
    this.physics.add.existing(this.ground, true);

    this.anchor = new Phaser.Math.Vector2(170, H-165);
    this.add.rectangle(this.anchor.x-20, this.anchor.y+52, 18, 100, 0x8b5a2b).setAngle(-6);
    this.add.rectangle(this.anchor.x+20, this.anchor.y+52, 18, 100, 0x8b5a2b).setAngle(6);
    this.add.circle(this.anchor.x-20, this.anchor.y+2, 8, 0x6b4020);
    this.add.circle(this.anchor.x+20, this.anchor.y+2, 8, 0x6b4020);

    this.bandGfx = this.add.graphics();
    this.trajGfx = this.add.graphics();

    this.makeTextures();

    this.blocks = this.physics.add.group();
    this.physics.add.collider(this.blocks, this.ground);
    this.physics.add.collider(this.blocks, this.blocks);
    this.birds   = this.physics.add.group();
    this.pigMeta = [];

    // UI panel
    this.add.rectangle(W/2, 46, W, 92, 0x000000, 0.35).setDepth(3);

    this.wordText  = this.add.text(20, 8, "",
      { fontSize:"32px", color:"#ffffff", fontStyle:"bold",
        stroke:"#1e293b", strokeThickness:4 }).setDepth(5);
    this.levelText = this.add.text(20, 50, "",
      { fontSize:"13px", color:"#94d4ff" }).setDepth(5);
    this.tipText   = this.add.text(20, 68, "",
      { fontSize:"13px", color:"#d1fae5" }).setDepth(5);

    this.scoreText  = this.add.text(W-220, 8,  "Score: 0",
      { fontSize:"22px", color:"#fbbf24", fontStyle:"bold" }).setDepth(5);
    this.streakText = this.add.text(W-220, 38, "",
      { fontSize:"20px", color:"#f59e0b" }).setDepth(5);
    this.birdLabel  = this.add.text(W-220, 62, "",
      { fontSize:"13px", color:"#a5f3fc" }).setDepth(5);

    this.masteredText = this.add.text(W/2, 10, "",
      { fontSize:"13px", color:"#86efac", align:"center" }).setOrigin(0.5,0).setDepth(5);

    // Timer bar
    const TY = 90;
    this.add.rectangle(W/2, TY, W, 8, 0x1e293b, 0.6).setDepth(4);
    this.timerBar = this.add.rectangle(0, TY, W, 8, 0x22c55e).setOrigin(0,0.5).setDepth(5);
    this.timerNum = this.add.text(W-6, TY, "10",
      { fontSize:"11px", color:"#e2e8f0", fontStyle:"bold" }).setOrigin(1,0.5).setDepth(5);

    // Banner
    this.banner = this.add.text(W/2, 155, "", {
      fontSize:"58px", fontStyle:"bold", color:"#ffffff",
      stroke:"#1e293b", strokeThickness:10
    }).setOrigin(0.5).setAlpha(0).setDepth(12);

    // Reveal panel
    this.revealBg    = this.add.rectangle(W/2, H/2, 580, 140, 0x0f172a, 0.96)
      .setStrokeStyle(2, 0xfbbf24).setDepth(22).setAlpha(0);
    this.revealLine1 = this.add.text(W/2, H/2-28, "", {
      fontSize:"24px", fontStyle:"bold", color:"#fbbf24",
      align:"center", wordWrap:{width:550}
    }).setOrigin(0.5).setDepth(23).setAlpha(0);
    this.revealLine2 = this.add.text(W/2, H/2+20, "", {
      fontSize:"18px", color:"#e2e8f0",
      align:"center", wordWrap:{width:550}
    }).setOrigin(0.5).setDepth(23).setAlpha(0);

    // Bottom buttons
    this.makeButton(80,  H-22, 130, 34, "⏭ 下一题",    ()=>{ safeResumeAudio(this); this.finishRoundAndNext(); });
    this.studyBtn = this.makeButton(225, H-22, 160, 34, "📚 学习模式 OFF", ()=>{ safeResumeAudio(this); this.toggleStudyMode(); });
    this.makeButton(410, H-22, 130, 34, "📊 结束学习",  ()=>{ safeResumeAudio(this); this.endSession(); });

    this.input.on("pointerdown", ()=>{
      safeResumeAudio(this);
      if (!this.launched||this.roundFinished||this.dragging||this.skillUsed) return;
      this.useSkill();
    });

    this.bindDrag();
    this.newRound();
  }

  endSession() {
    // Stop game and show results
    this.stopTimer();
    this.roundFinished = true;
    if (gameInstance) {
      gameInstance.destroy(true);
      gameInstance = null;
    }
    document.getElementById("wrap").style.display = "none";
    Screens.showResults();
  }

  drawSky() {
    const g = this.add.graphics();
    for (let i=0; i<H; i++) {
      const t   = i/H;
      const r   = Math.round(Phaser.Math.Linear(0x87,0xc8,t));
      const grn = Math.round(Phaser.Math.Linear(0xce,0xe8,t));
      const b   = Math.round(Phaser.Math.Linear(0xeb,0xff,t));
      g.fillStyle((r<<16)|(grn<<8)|b, 1);
      g.fillRect(0, i, W, 1);
    }
    g.setDepth(0);
  }

  spawnClouds() {
    const cloudY = [80, 130, 100, 160, 90];
    const cloudX = [100, 280, 500, 720, 950];
    const sizes  = [0.8, 1.1, 0.7, 1.3, 0.9];
    cloudX.forEach((cx, i) => {
      const g = this.add.graphics().setDepth(1).setAlpha(0.75);
      const s = sizes[i];
      g.fillStyle(0xffffff);
      g.fillEllipse(cx,       cloudY[i],     80*s, 35*s);
      g.fillEllipse(cx+28*s,  cloudY[i]-14*s, 55*s, 38*s);
      g.fillEllipse(cx-24*s,  cloudY[i]-10*s, 50*s, 30*s);
      g.fillEllipse(cx+52*s,  cloudY[i],     45*s, 28*s);
      this.tweens.add({
        targets:g, x:"+="+(18+i*6), duration:8000+i*1500,
        yoyo:true, repeat:-1, ease:"Sine.easeInOut"
      });
    });
  }

  toggleStudyMode() {
    this.studyMode = !this.studyMode;
    this.studyBtn.lb.setText("📚 学习模式 "+(this.studyMode?"ON ✓":"OFF"));
    this.studyBtn.bg.setFillStyle(this.studyMode ? 0x0284c7 : 0x1e293b);
  }

  makeTextures() {
    if (this.textures.exists("wood")) return;
    let g = this.add.graphics();
    g.fillStyle(0xb7791f); g.fillRoundedRect(0,0,115,24,7);
    g.fillStyle(0xd4a843,0.5); g.fillRoundedRect(3,3,109,10,5);
    g.lineStyle(3,0x7a4a12); g.strokeRoundedRect(0,0,115,24,7);
    g.generateTexture("wood",115,24); g.destroy();
    g = this.add.graphics();
    g.fillStyle(0x7c8fa0); g.fillRoundedRect(0,0,105,28,7);
    g.fillStyle(0xaabbc8,0.4); g.fillRoundedRect(3,3,99,12,5);
    g.lineStyle(3,0x4e6070); g.strokeRoundedRect(0,0,105,28,7);
    g.generateTexture("stone",105,28); g.destroy();
    g = this.add.graphics();
    g.fillStyle(0xffc24b); g.fillCircle(6,6,6);
    g.generateTexture("spark",12,12); g.destroy();
  }

  makeBirdContainer(x, y, type="RED") {
    const CFG = {
      RED:    { body:0xff3b3b, stroke:0xb91c1c, belly:0xffa0a0, brow:0x7f1d1d, beak:0xfbbf24 },
      BLUE:   { body:0x3b82f6, stroke:0x1d4ed8, belly:0x93c5fd, brow:0x1e3a8a, beak:0xfbbf24 },
      BLACK:  { body:0x1e293b, stroke:0x000000, belly:0x475569, brow:0x64748b, beak:0xfcd34d },
      GREEN:  { body:0x22c55e, stroke:0x15803d, belly:0x86efac, brow:0x14532d, beak:0xfde68a },
      YELLOW: { body:0xfbbf24, stroke:0xb45309, belly:0xfde68a, brow:0x78350f, beak:0xef4444 },
      ORANGE: { body:0xf97316, stroke:0x9a3412, belly:0xfdba74, brow:0x7c2d12, beak:0xfef08a },
      PURPLE: { body:0xa855f7, stroke:0x6b21a8, belly:0xd8b4fe, brow:0x3b0764, beak:0xfef9c3 },
    };
    const c = CFG[type]||CFG.RED;
    const sz = type==="YELLOW"?28:type==="ORANGE"?26:23;

    const children = [
      this.add.circle(0,0,sz,c.body).setStrokeStyle(3,c.stroke),
      this.add.ellipse(5,11,sz-2,16,c.belly).setAlpha(0.55),
      this.add.circle(7,-7,10,0xffffff), this.add.circle(10,-7,4,0x111827),
      this.add.circle(8,-9,2,0xffffff,0.8),
      this.add.rectangle(7,-sz-1,26,6,c.brow).setAngle(-12),
      this.add.triangle(15,4,0,0,18,7,0,14,c.beak).setStrokeStyle(2,0xd97706),
    ];
    const symbols = { GREEN:"⚡", YELLOW:"🔨", ORANGE:"↺", PURPLE:"✳" };
    if (symbols[type]) {
      const col = type==="ORANGE"?"#ffffff":"";
      children.push(this.add.text(-5,-5,symbols[type],{fontSize:"12px",color:col}).setOrigin(0.5));
    }
    const ct = this.add.container(x, y, children);
    ct.setSize(80,80);
    return ct;
  }

  makePig(x, y) {
    const ct = this.add.container(x, y, [
      this.add.ellipse(3,5,58,22,0x000000,0.15),
      this.add.circle(0,0,27,0x4ade80).setStrokeStyle(3,0x16a34a),
      this.add.ellipse(7,11,30,20,0x86efac).setStrokeStyle(2,0x22c55e),
      this.add.circle(1,11,3.5,0x14532d), this.add.circle(13,11,3.5,0x14532d),
      this.add.circle(-9,-7,8,0xffffff),  this.add.circle(-7,-7,3.5,0x111827),
      this.add.circle(9,-7,8,0xffffff),   this.add.circle(11,-7,3.5,0x111827),
      this.add.circle(-8,-9,2,0xffffff,0.8), this.add.circle(10,-9,2,0xffffff,0.8),
    ]);
    ct.setSize(80,80);
    return ct;
  }

  makeButton(x, y, w, h, text, onClick) {
    const bg = this.add.rectangle(x,y,w,h,0x1e293b,0.92)
      .setInteractive({useHandCursor:true}).setStrokeStyle(1,0x475569).setDepth(5);
    const lb = this.add.text(x,y,text,{fontSize:"14px",color:"#f1f5f9"}).setOrigin(0.5).setDepth(6);
    bg.on("pointerdown",()=>{ bg.setScale(0.96); onClick(); });
    bg.on("pointerup",  ()=>bg.setScale(1));
    bg.on("pointerover",()=>bg.setFillStyle(0x334155,0.95));
    bg.on("pointerout", ()=>{ bg.setScale(1); bg.setFillStyle(0x1e293b,0.92); });
    return {bg, lb};
  }

  lockBlocks(locked) {
    this.blocks.getChildren().forEach(b => {
      if (!b?.body) return;
      b.body.setAllowGravity(!locked);
      b.setImmovable(locked);
      if (locked) {
        b.body.setVelocity(0,0);
        if (typeof b.body.angularVelocity==="number") b.body.angularVelocity=0;
        else b.body.setAngularVelocity?.(0);
      }
    });
  }

  spawnLevelBlocks() {
    const lv = Math.min(this.level, 6);
    const B  = [H-23, H-50];
    const scale = W/900;
    const layouts = [
      [[535*scale, B[0],"wood"], [645*scale, B[0],"wood"]],
      [[530*scale, B[0],"wood"], [530*scale, B[1],"stone"], [650*scale, B[0],"stone"]],
      [[520*scale, B[0],"stone"], [520*scale, B[1],"wood"],
       [635*scale, B[0],"wood"],  [635*scale, B[1],"stone"]],
      [[515*scale, B[0],"wood"],  [515*scale, B[1],"stone"],
       [580*scale, B[0],"stone"],
       [645*scale, B[0],"wood"],  [645*scale, B[1],"wood"]],
      [[510*scale, B[0],"stone"], [510*scale, B[1],"wood"],
       [570*scale, B[0],"wood"],  [570*scale, B[1],"stone"],
       [632*scale, B[0],"stone"], [632*scale, B[1],"wood"]],
      [[505*scale, B[0],"wood"],  [505*scale, B[1],"stone"],
       [558*scale, B[0],"stone"], [558*scale, B[1],"wood"],
       [612*scale, B[0],"wood"],  [612*scale, B[1],"stone"],
       [662*scale, B[0],"stone"]],
    ];
    (layouts[lv-1]||layouts[layouts.length-1]).forEach(([x,y,type])=>{
      const b = this.blocks.create(x,y,type);
      if (type==="wood") b.setBounce(0.02).setDrag(0.92,0.92).setMass(2);
      else               b.setBounce(0.01).setDrag(0.90,0.90).setMass(3.2);
      b.setCollideWorldBounds(true);
    });
    this.lockBlocks(true);
  }

  spawnMainBird() {
    this.birds.clear(true,true);
    const bird = this.makeBirdContainer(this.anchor.x, this.anchor.y, this.birdType);
    this.physics.add.existing(bird);
    const r = this.birdType==="YELLOW"?28:this.birdType==="ORANGE"?26:23;
    bird.body.setCircle(r,-r,-r).setCollideWorldBounds(true).setBounce(0.45)
      .setDrag(0.35,0.35).setAllowGravity(false);
    if (this.birdType==="ORANGE") bird.body.setBounce(0.55);
    this.physics.add.collider(bird, this.ground);
    this.physics.add.collider(bird, this.blocks);
    bird.setInteractive(new Phaser.Geom.Circle(0,0,90), Phaser.Geom.Circle.Contains);
    this.input.setDraggable(bird);
    this.bird=bird; this.birds.add(bird);
  }

  resetBird() {
    this.skillUsed=false; this.bandGfx.clear(); this.trajGfx.clear();
    this.spawnMainBird();
    this.bird.x=this.anchor.x; this.bird.y=this.anchor.y;
    this.bird.body.setVelocity(0,0).setAllowGravity(false).setGravityY(0);
    this.bird.body.moves=true;
  }

  bindDrag() {
    if (this._dragBound) return;
    this._dragBound=true;
    this.input.on("dragstart",()=>{
      if (this.roundFinished||this.launched||this.studyPreviewing) return;
      safeResumeAudio(this); this.dragging=true;
      this.bird.body.setVelocity(0,0).setAllowGravity(false);
      this.bird.body.moves=false;
      beep(this,520,0.05,"sine",0.03);
    });
    this.input.on("drag",(pointer,obj,dragX,dragY)=>{
      if (!this.dragging||this.roundFinished||this.launched) return;
      const nx=Phaser.Math.Linear(obj.x,dragX,1-this.DRAG_SMOOTH);
      const ny=Phaser.Math.Linear(obj.y,dragY,1-this.DRAG_SMOOTH);
      const v=new Phaser.Math.Vector2(nx-this.anchor.x,ny-this.anchor.y);
      const dist=v.length();
      if (dist>this.MAX_PULL) v.normalize().scale(this.MAX_PULL);
      obj.x=this.anchor.x+v.x; obj.y=this.anchor.y+v.y;
      this.drawBandAndTrajectory(obj.x,obj.y);
    });
    this.input.on("dragend",()=>{
      if (!this.dragging||this.roundFinished||this.launched) return;
      this.dragging=false;
      const pull=new Phaser.Math.Vector2(this.bird.x-this.anchor.x,this.bird.y-this.anchor.y);
      const speed = this.birdType==="GREEN" ? this.POWER*1.5 : this.POWER;
      const vel=pull.clone().scale(-speed);
      this.lockBlocks(false);
      this.bird.body.moves=true;
      this.bird.body.setAllowGravity(true).setGravityY(this.GRAVITY_Y);
      this.bird.body.setVelocity(vel.x,vel.y);
      this.launched=true;
      this.bandGfx.clear(); this.trajGfx.clear();
      this.stopTimer();
      const myRound=this.roundId;
      this.time.delayedCall(4500,()=>{
        if (this.roundId!==myRound||this.roundFinished) return;
        this.onChoose(false,W/2,H/2,null);
      });
      beep(this,780,0.06,"square",0.05);
    });
  }

  startTimer() {
    if (this.timerActive) return;
    this.timerActive=true; this.timeLeft=10; this.updateTimerVisual();
    this.timerEvent=this.time.addEvent({
      delay:1000, repeat:9,
      callback:()=>{
        if (!this.timerActive) return;
        this.timeLeft=Math.max(0,this.timeLeft-1); this.updateTimerVisual();
        if (this.timeLeft<=3&&this.timeLeft>0) beep(this,440,0.05,"square",0.03);
        if (this.timeLeft===0&&!this.launched&&!this.roundFinished) {
          this.timerActive=false;
          this.showBanner("⏰ 超时！","#94a3b8");
          this.time.delayedCall(300,()=>this.onChoose(false,W/2,H/2,null));
        }
      }
    });
  }

  stopTimer() {
    this.timerActive=false;
    if (this.timerEvent){this.timerEvent.remove();this.timerEvent=null;}
    this.timerBar.width=W; this.timerBar.setFillStyle(0x22c55e); this.timerNum.setText("--");
  }

  updateTimerVisual() {
    const pct=this.timeLeft/10;
    this.timerBar.width=W*Math.max(0,pct);
    this.timerNum.setText(this.timeLeft>0?String(this.timeLeft):"0");
    this.timerBar.setFillStyle(pct>0.5?0x22c55e:pct>0.25?0xf59e0b:0xef4444);
  }

  drawBandAndTrajectory(x,y) {
    this.bandGfx.clear(); this.trajGfx.clear();
    this.bandGfx.lineStyle(8,0x5b2d0a,0.5);
    this.bandGfx.beginPath(); this.bandGfx.moveTo(this.anchor.x,this.anchor.y);
    this.bandGfx.lineTo(x,y); this.bandGfx.strokePath();
    const v0=new Phaser.Math.Vector2(x-this.anchor.x,y-this.anchor.y).scale(-this.POWER);
    const g=this.GRAVITY_Y;
    this.trajGfx.fillStyle(0x1e293b,0.25);
    for (let i=1;i<=30;i++){
      const t=i*0.075,px=x+v0.x*t,py=y+v0.y*t+0.5*g*t*t;
      if (px<0||px>W||py<0||py>H) break;
      this.trajGfx.fillCircle(px,py,3.5);
    }
  }

  spawnPigs() {
    const bubCX = Math.round(W * 0.70);
    const pigX  = Math.round(W * 0.90);
    const ys    = [175, 355, 515];
    const bubW  = 290, bubH = 80;
    const colors= [0x3b82f6, 0xf59e0b, 0xa855f7];
    const moving= this.level >= 3;

    this.q.choices.forEach((c, i) => {
      const y = ys[i];

      const pig = this.makePig(pigX, y);
      this.tweens.add({ targets:pig, scaleY:0.9, duration:500+i*80,
        yoyo:true, repeat:-1, ease:"Sine.easeInOut" });

      const bx = bubCX - bubW/2;
      const by = y - bubH/2;
      const bubble = this.add.graphics().setDepth(2);
      bubble.fillStyle(0xffffff, 0.98);
      bubble.fillRoundedRect(bx, by, bubW, bubH, 12);
      bubble.fillStyle(colors[i], 1);
      bubble.fillRoundedRect(bx, by, 8, bubH, {tl:12, bl:12, tr:0, br:0});
      bubble.lineStyle(2, 0xc0c8d4, 1);
      bubble.strokeRoundedRect(bx, by, bubW, bubH, 12);

      const label = this.add.text(bubCX + 6, y, c.text, {
        fontSize:"18px", color:"#000000", fontStyle:"bold", align:"center",
        wordWrap:{ width: bubW-32, useAdvancedWrap:true }
      }).setOrigin(0.5).setDepth(3);

      let moveTween = null;
      if (moving) {
        const range = 38 + i * 12;
        moveTween = this.tweens.add({
          targets: pig, x: "+=" + range,
          duration: 950+i*260, yoyo:true, repeat:-1, ease:"Sine.easeInOut"
        });
      }

      this.pigMeta.push({ pig, label, bubble, ok:c.ok, alive:true, moveTween });
    });
  }

  update() {
    if (this.roundFinished||!this.launched) return;
    this.birds.getChildren().forEach(birdObj=>{
      if (!birdObj?.active) return;
      this.pigMeta.forEach(pm=>{
        if (!pm.alive) return;
        if (Phaser.Math.Distance.Between(birdObj.x,birdObj.y,pm.pig.x,pm.pig.y)<65){
          pm.alive=false;
          this.onChoose(pm.ok,pm.pig.x,pm.pig.y,pm);
        }
      });
    });
  }

  onChoose(ok,hitX,hitY,pm) {
    if (this.roundFinished) return;
    this.roundFinished=true;
    this.stopTimer();
    this.cameras.main.shake(80,0.006);

    if (ok){
      this.streak++; this.questionCount++;
      const add=10+Math.min(20,this.streak*2);
      this.score+=add;
      this.scoreText.setText("Score: "+this.score);
      this.updateStreakDisplay();

      markCorrect(this.q.correct);
      this.masteredText.setText(MASTERED.size>0?"✅ 已掌握 "+MASTERED.size+" 词":"");

      // Session tracking: correct on first try (within this session)
      Session.record(this.q.correct.word, this.q.correct.meaning, true);

      if (pm?.pig) this.pigFlyOff(pm);

      let txt="✅ CORRECT!",col="#065f46";
      if (this.streak>=8)      {txt="🏆 PERFECT!!!";          col="#7c3aed";}
      else if (this.streak>=5) {txt="⚡ COMBO ×"+this.streak+"!";col="#dc2626";}
      else if (this.streak>=3) {txt="🎯 NICE SHOT!";           col="#d97706";}
      else if (this.streak>=2) {txt="✅ ×"+this.streak+" 连击";col="#0369a1";}

      this.showBanner(txt,col);
      this.tipText.setText("✅ +"+add+"  连击 ×"+this.streak);
      this.cameras.main.setBackgroundColor(
        this.bgPalette[Math.min(Math.floor(this.streak/2),this.bgPalette.length-1)]);

      beep(this,920,0.09,"sine",0.06);
      if (this.streak>=3) beep(this,1100+this.streak*40,0.06,"sine",0.04);

      const myRound=this.roundId;
      this.time.delayedCall(1100,()=>{if(this.roundId===myRound)this.finishRoundAndNext();});
    } else {
      this.streak=0;
      this.cameras.main.setBackgroundColor(this.bgPalette[0]);
      this.updateStreakDisplay();
      if (this.launched&&this.bird?.body) this.birdBounceBack();
      this.tipText.setText("❌ 答错了！看正确答案...");
      this.showBanner("❌ WRONG!","#991b1b");
      beep(this,220,0.14,"sawtooth",0.06);
      addToRevenge(this.q.correct);

      // Session tracking: wrong
      Session.record(this.q.correct.word, this.q.correct.meaning, false);

      this.showReveal(this.q.correct.word,this.q.correct.meaning);
      const myRound=this.roundId;
      this.time.delayedCall(2700,()=>{if(this.roundId===myRound)this.finishRoundAndNext();});
    }
  }

  pigFlyOff(pm) {
    if (!pm?.pig) return;
    const flash=this.add.circle(pm.pig.x,pm.pig.y,36,0xffffff,0.9);
    this.tweens.add({targets:flash,alpha:0,scale:2.8,duration:240,onComplete:()=>flash.destroy()});
    try {
      const p=this.add.particles(pm.pig.x,pm.pig.y,"spark",{
        speed:{min:110,max:450},angle:{min:0,max:360},
        scale:{start:1.2,end:0},lifespan:500,quantity:25
      });
      this.time.delayedCall(520,()=>{try{p.destroy();}catch(e){}});
    } catch(e){}
    const dir=Phaser.Math.Between(0,1)?320:-320;
    this.tweens.add({
      targets:pm.pig, x:pm.pig.x+dir, y:-120, angle:720,
      scaleX:0.04,scaleY:0.04, duration:650, ease:"Back.easeIn",
      onComplete:()=>{try{pm.pig.destroy();}catch(e){}}
    });
    [pm.bubble,pm.label].forEach(o=>{
      if (!o) return;
      this.tweens.add({targets:o,alpha:0,duration:200});
    });
  }

  birdBounceBack() {
    if (!this.bird?.body) return;
    const vx=this.bird.body.velocity.x,vy=this.bird.body.velocity.y;
    this.bird.body.setVelocity(-Math.abs(vx)*2.5,Math.min(-60,vy*0.3-80));
    this.tweens.add({targets:this.bird,angle:720,duration:450,repeat:1,ease:"Linear"});
    this.time.delayedCall(500,()=>{
      const ouch=this.add.text(this.anchor.x+25,this.anchor.y-60,"OUCH! 😵",{
        fontSize:"28px",fontStyle:"bold",color:"#dc2626",
        stroke:"#ffffff",strokeThickness:5
      }).setOrigin(0.5).setDepth(15);
      this.tweens.add({targets:ouch,y:ouch.y-50,alpha:0,duration:950,
        ease:"Cubic.easeOut",onComplete:()=>ouch.destroy()});
      this.cameras.main.shake(80,0.008);
      beep(this,160,0.08,"sawtooth",0.05);
    });
  }

  showReveal(word,meaning) {
    this.revealLine1.setText("✓ 正确答案："+word);
    this.revealLine2.setText(meaning.length>60?meaning.slice(0,60)+"…":meaning);
    this.tweens.add({targets:[this.revealBg,this.revealLine1,this.revealLine2],alpha:1,duration:200});
    this.time.delayedCall(2100,()=>{
      this.tweens.add({targets:[this.revealBg,this.revealLine1,this.revealLine2],alpha:0,duration:350});
    });
  }

  showBanner(text,color="#111827") {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.8);
    this.tweens.add({targets:this.banner,scale:1.1,duration:130,yoyo:true});
    this.tweens.add({
      targets:this.banner,alpha:0,y:118,duration:780,delay:560,
      onComplete:()=>{this.banner.y=155;}
    });
  }

  updateStreakDisplay() {
    if (this.streak>=8)      this.streakText.setText("🔥🔥 ×"+this.streak).setColor("#a855f7");
    else if (this.streak>=5) this.streakText.setText("🔥 ×"+this.streak).setColor("#ef4444");
    else if (this.streak>=2) this.streakText.setText("⚡ ×"+this.streak).setColor("#f59e0b");
    else                     this.streakText.setText("");
  }

  finishRoundAndNext() {
    this.bandGfx.clear(); this.trajGfx.clear();
    this.newRound();
  }

  useSkill() {
    this.skillUsed=true;
    const vx=this.bird?.body?.velocity?.x??0;
    const vy=this.bird?.body?.velocity?.y??0;
    const bx=this.bird?.x??0, by=this.bird?.y??0;

    if (this.birdType==="BLUE") {
      beep(this,980,0.06,"sine",0.05);
      [-130,+130].forEach(dvy=>{
        const b=this.makeBirdContainer(bx,by,"BLUE");
        this.physics.add.existing(b);
        b.body.setCircle(18,-18,-18).setCollideWorldBounds(true).setBounce(0.45)
          .setDrag(0.35,0.35).setAllowGravity(true).setGravityY(this.GRAVITY_Y);
        b.body.setVelocity(vx,vy+dvy);
        this.physics.add.collider(b,this.ground);
        this.physics.add.collider(b,this.blocks);
        this.birds.add(b);
      });
      this.showBanner("✂ BLUE SPLIT!","#1d4ed8");
    } else if (this.birdType==="BLACK") {
      beep(this,180,0.10,"sawtooth",0.06);
      this.doExplode(bx,by,175);
      this.showBanner("💥 BOOM!","#b91c1c");
      this.bird.destroy();
    } else if (this.birdType==="GREEN") {
      beep(this,1200,0.06,"square",0.04);
      this.bird.body.setVelocity(vx*1.8,vy*1.3);
      const tr=this.add.circle(bx,by,18,0x86efac,0.7);
      this.tweens.add({targets:tr,alpha:0,scale:2.2,duration:280,onComplete:()=>tr.destroy()});
      this.showBanner("⚡ SPEED BOOST!","#15803d");
    } else if (this.birdType==="YELLOW") {
      beep(this,300,0.08,"sawtooth",0.05);
      this.bird.body.setVelocity(vx*0.3,680);
      this.bird.body.setGravityY(this.GRAVITY_Y*2);
      this.cameras.main.shake(60,0.006);
      this.showBanner("🔨 GROUND SMASH!","#d97706");
    } else if (this.birdType==="ORANGE") {
      beep(this,650,0.07,"sine",0.05);
      this.bird.body.setBounce(0.92).setDrag(0.05,0.05);
      this.showBanner("↺ SUPER BOUNCE!","#c2410c");
    } else if (this.birdType==="PURPLE") {
      beep(this,1050,0.07,"sine",0.05);
      [-160,0,+160].forEach(dvy=>{
        const b=this.makeBirdContainer(bx,by,"PURPLE");
        this.physics.add.existing(b);
        b.body.setCircle(18,-18,-18).setCollideWorldBounds(true).setBounce(0.45)
          .setDrag(0.35,0.35).setAllowGravity(true).setGravityY(this.GRAVITY_Y);
        b.body.setVelocity(vx*0.9,vy+dvy);
        this.physics.add.collider(b,this.ground);
        this.physics.add.collider(b,this.blocks);
        this.birds.add(b);
      });
      this.bird.destroy();
      this.showBanner("✳ TRIPLE SPLIT!","#7e22ce");
    } else {
      this.showBanner("RED: 无技能","#6b7280");
    }
  }

  doExplode(x,y,radius=150) {
    try {
      this.cameras.main.shake(150,0.013);
      const p=this.add.particles(x,y,"spark",{
        speed:{min:130,max:550},angle:{min:0,max:360},
        scale:{start:1.1,end:0},lifespan:550,quantity:30
      });
      this.time.delayedCall(560,()=>{try{p.destroy();}catch(e){}});
      this.blocks.getChildren().forEach(b=>{
        if (!b?.body) return;
        const dx=b.x-x,dy=b.y-y,dist=Math.max(60,Math.sqrt(dx*dx+dy*dy));
        if (dist>radius) return;
        const f=(radius*65)/dist;
        b.body.velocity.x+=(dx/dist)*f; b.body.velocity.y+=(dy/dist)*f;
        const av=Math.random()*130-65;
        if (typeof b.body.angularVelocity==="number") b.body.angularVelocity+=av;
        else b.body.setAngularVelocity?.(av);
      });
      if (!this.roundFinished){
        let best=null,bestD=1e9;
        this.pigMeta.forEach(pm=>{
          if (!pm.alive) return;
          const d=Phaser.Math.Distance.Between(pm.pig.x,pm.pig.y,x,y);
          if (d<bestD&&d<=radius){bestD=d;best=pm;}
        });
        if (best){best.alive=false;this.onChoose(best.ok,best.pig.x,best.pig.y,best);}
      }
    } catch(err){console.error("explode:",err);}
  }

  newRound() {
    this.roundId++;
    this.roundFinished=false; this.launched=false; this.dragging=false;
    this.skillUsed=false; this.studyPreviewing=false;
    this.stopTimer();

    this.blocks.clear(true,true);
    this.pigMeta.forEach(p=>{
      p.pig?.destroy(); p.label?.destroy(); p.bubble?.destroy(); p.moveTween?.stop();
    });
    this.pigMeta=[];

    this.birdIndex=(this.birdIndex+1)%this.birdCycle.length;
    this.birdType=this.birdCycle[this.birdIndex];
    const HINTS={
      RED:"🔴 普通（无技能）", BLUE:"🔵 分裂 ×2（飞行中点击）",
      BLACK:"⚫ 爆炸（飞行中点击）", GREEN:"🟢 加速（飞行中点击）",
      YELLOW:"🟡 重力砸（飞行中点击）", ORANGE:"🟠 超弹跳（飞行中点击）",
      PURPLE:"🟣 分裂 ×3（飞行中点击）"
    };
    this.birdLabel.setText(HINTS[this.birdType]||this.birdType);

    this.levelQ++;
    if (this.levelQ>5){this.levelQ=1;this.level++;this.showBanner("🎉 LEVEL "+this.level+"!","#fbbf24");}

    const imCount=REVENGE_POOL.filter(r=>r.immediate>0).length;
    const spCount=REVENGE_POOL.filter(r=>r.immediate===0).length;
    let ri="";
    if (imCount>0) ri="  ⚡立即复习:"+imCount+"词";
    else if (spCount>0) ri="  🔁待复习:"+spCount+"词";
    this.levelText.setText("第"+this.level+"关  Q"+this.levelQ+"/5"+ri);
    this.tipText.setText("拖鸟→发射，击中正确答案的猪！  飞行中点击=技能");
    this.masteredText.setText(MASTERED.size>0?"✅ 已掌握 "+MASTERED.size+" 词":"");

    this.spawnLevelBlocks();
    this.q=makeQuestion();

    if (this.studyMode){
      this.studyPreviewing=true;
      this.wordText.setText("📖 "+this.q.correct.word+"  →  "+this.q.correct.meaning);
      this.tipText.setText("📚 学习预览 2秒后开始...");
      this.resetBird();
      this.time.delayedCall(2000,()=>{
        if (!this.studyPreviewing) return;
        this.studyPreviewing=false;
        this.wordText.setText("WORD: "+this.q.correct.word);
        this.tipText.setText("拖鸟→发射，击中正确答案的猪！  飞行中点击=技能");
        this.spawnPigs(); this.startTimer();
      });
    } else {
      this.wordText.setText("WORD: "+this.q.correct.word);
      this.spawnPigs(); this.resetBird(); this.startTimer();
    }
  }
}


// ══════════════════════════════════════════════════════════
//  APP INIT — Wire up screens
// ══════════════════════════════════════════════════════════
let gameInstance = null;

function startGame() {
  initGamePool();
  Session.start();
  Screens.showGame();

  const config = {
    type: Phaser.AUTO,
    width:  W,
    height: H,
    parent: "wrap",
    backgroundColor: "#87ceeb",
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: { default:"arcade", arcade:{ gravity:{y:0}, debug:false } },
    scene: [GameScene]
  };

  gameInstance = new Phaser.Game(config);
}

// Login
document.getElementById("loginBtn").addEventListener("click", () => {
  const name = document.getElementById("usernameInput").value.trim();
  if (!name) { document.getElementById("usernameInput").focus(); return; }
  UserManager.login(name);
  DictUI.init();
  DictUI.render();
  Screens.show("dictScreen");
});

document.getElementById("usernameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

// Start game from dictionary
document.getElementById("startGameBtn").addEventListener("click", () => {
  const selected = UserManager.getSelectedWords();
  if (selected.length < 3) {
    alert("请至少选择 3 个词！");
    return;
  }
  startGame();
});

// Results -> back to dict
document.getElementById("rBackDict").addEventListener("click", () => {
  DictUI.render();
  Screens.show("dictScreen");
});

// Results -> play again
document.getElementById("rPlayAgain").addEventListener("click", () => {
  startGame();
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  UserManager.logout();
  Screens.show("loginScreen");
  document.getElementById("usernameInput").value = "";
});

// Show login by default
Screens.show("loginScreen");
