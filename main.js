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
    data.wordData[word].mastered = true;
    this.save(data);
  },

  recordMistake(word) {
    const data = this.load();
    if (!data.wordData[word]) data.wordData[word] = { selected: false, correctFirst: 0, mistakes: 0, mastered: false };
    data.wordData[word].mistakes++;
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
  filter: "all",
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

    this.els.search.addEventListener("input", () => {
      this.searchTerm = this.els.search.value.trim().toLowerCase();
      this.render();
    });

    const setFilter = (f) => {
      this.filter = f;
      this.updateFilterBtns();
      this.render();
    };
    this.els.filterAll.addEventListener("click",     () => setFilter("all"));
    this.els.filterChecked.addEventListener("click",  () => setFilter("checked"));
    this.els.filterWrong.addEventListener("click",    () => setFilter("wrong"));
    this.els.filterMastered.addEventListener("click", () => setFilter("mastered"));

    this.els.selectAllBtn.addEventListener("click", () => {
      const words = this.renderedWords.filter(w => !w._isMastered).map(w => w.word);
      UserManager.batchSetSelected(words, true);
      this.render();
    });

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

    if (this.searchTerm) {
      words = words.filter(w =>
        w.word.toLowerCase().includes(this.searchTerm) ||
        w.meaning.includes(this.searchTerm)
      );
    }

    if (this.filter === "checked")  words = words.filter(w => w._selected);
    if (this.filter === "wrong")    words = words.filter(w => w._mistakes > 0 && !w._mastered);
    if (this.filter === "mastered") words = words.filter(w => w._mastered);

    const active   = words.filter(w => !w._mastered);
    const mastered = words.filter(w => w._mastered);
    return { active, mastered };
  },

  render() {
    const { active, mastered } = this.getFilteredWords();
    this.renderedWords = [...active, ...mastered];

    const selectedCount = ALL_WORDS.filter(w => UserManager.getWordData(w.word).selected).length;
    const masteredCount = ALL_WORDS.filter(w => UserManager.getWordData(w.word).mastered).length;
    this.els.stats.textContent = `已选 ${selectedCount} 词 · 已掌握 ${masteredCount} 词 · 共 ${ALL_WORDS.length} 词`;
    this.els.startBtn.disabled = selectedCount < 3;

    const html = [];
    let currentLetter = "";

    active.forEach(w => {
      const firstLetter = w.word[0].toUpperCase();
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        html.push(`<div class="letter-group" id="letter-${firstLetter}">${firstLetter}</div>`);
      }
      html.push(this.wordRowHTML(w));
    });

    if (mastered.length > 0) {
      html.push(`<div class="mastered-divider">✅ 已掌握 (${mastered.length} 词)</div>`);
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
    this.els.body.onclick = (e) => {
      const row = e.target.closest(".word-row");
      if (!row) return;
      const word = row.dataset.word;
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
//  SESSION & GAME LOGIC
// ══════════════════════════════════════════════════════════
const Session = {
  results: [],
  active: false,
  start() { this.results = []; this.active = true; },
  record(word, meaning, correct) {
    if (this.results.find(r => r.word === word)) return;
    this.results.push({ word, meaning, correct });
    if (correct) UserManager.recordCorrectFirst(word);
    else UserManager.recordMistake(word);
  },
  getReport() {
    return {
      total: this.results.length,
      correct: this.results.filter(r => r.correct),
      wrong: this.results.filter(r => !r.correct)
    };
  }
};

const Screens = {
  show(id) {
    ["loginScreen","dictScreen","resultsScreen"].forEach(s => {
      document.getElementById(s).classList.toggle("hidden", s !== id);
    });
    document.getElementById("wrap").style.display = (id === "game") ? "block" : "none";
  },
  showResults() {
    const report = Session.getReport();
    document.getElementById("rTotal").textContent = report.total;
    document.getElementById("rCorrect").textContent = report.correct.length;
    document.getElementById("rWrong").textContent = report.wrong.length;
    document.getElementById("rCorrectList").innerHTML = report.correct.map(r => `<span class="results-word-tag tag-correct">${r.word}</span>`).join("") || "无";
    document.getElementById("rWrongList").innerHTML = report.wrong.map(r => `<span class="results-word-tag tag-wrong">${r.word}</span>`).join("") || "无";
    this.show("resultsScreen");
  }
};

// ══════════════════════════════════════════════════════════
//  GAME ENGINE (Phaser)
// ══════════════════════════════════════════════════════════
let gameInstance = null;
const W = 1100, H = 620;

class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  create() {
    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor("#87ceeb"); // 优化：直接设置背景色代替循环绘图
    
    // 初始化变量
    this.score = 0; this.launched = false; this.roundFinished = false;
    this.anchor = new Phaser.Math.Vector2(170, H-165);
    
    // UI
    this.add.rectangle(W/2, 46, W, 92, 0x000000, 0.35).setDepth(3);
    this.wordText = this.add.text(20, 20, "Ready?", { fontSize:"32px", color:"#fff", fontStyle:"bold" }).setDepth(5);
    
    // 简单的结束按钮
    const btn = this.add.rectangle(W-100, H-40, 150, 40, 0x1e293b).setInteractive({useHandCursor:true});
    this.add.text(W-100, H-40, "📊 结束学习", {fontSize:"16px", color:"#fff"}).setOrigin(0.5);
    btn.on("pointerdown", () => this.endSession());

    this.spawnBird();
  }

  spawnBird() {
    if (this.bird) this.bird.destroy();
    this.bird = this.add.circle(this.anchor.x, this.anchor.y, 23, 0xff3b3b).setStrokeStyle(3, 0xb91c1c);
    this.physics.add.existing(this.bird);
    this.bird.body.setAllowGravity(false).setCollideWorldBounds(true);
    this.bird.setInteractive();
    this.input.setDraggable(this.bird);
    
    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
        gameObject.x = dragX;
        gameObject.y = dragY;
    });

    this.input.on('dragend', (pointer, gameObject) => {
        this.launched = true;
        gameObject.body.setAllowGravity(true);
        gameObject.body.setVelocity((this.anchor.x - gameObject.x)*10, (this.anchor.y - gameObject.y)*10);
    });
  }

  endSession() {
    if (gameInstance) { gameInstance.destroy(true); gameInstance = null; }
    Screens.showResults();
  }
}

function startGame() {
  Session.start();
  Screens.show("game");
  if (gameInstance) gameInstance.destroy(true);

  const config = {
    type: Phaser.AUTO,
    width: W, height: H,
    parent: "wrap",
    
    // 👇 核心卡顿优化配置 👇
    resolution: 1,      // 降低iPad渲染压力
    render: {
      antialias: false, // 关闭抗锯齿提升帧率
      roundPixels: true
    },
    // 👆 ================= 👆

    backgroundColor: "#87ceeb",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: { default:"arcade", arcade:{ gravity:{y:600}, debug:false } },
    scene: [GameScene]
  };

  gameInstance = new Phaser.Game(config);
}

// ══════════════════════════════════════════════════════════
//  DOM EVENTS
// ══════════════════════════════════════════════════════════
document.getElementById("loginBtn").addEventListener("click", () => {
  const name = document.getElementById("usernameInput").value.trim();
  if (!name) return;
  UserManager.login(name);
  DictUI.init();
  DictUI.render();
  Screens.show("dictScreen");
});

document.getElementById("startGameBtn").addEventListener("click", () => {
  if (UserManager.getSelectedWords().length < 3) return alert("请至少选择 3 个词！");
  startGame();
});

document.getElementById("rBackDict").addEventListener("click", () => { DictUI.render(); Screens.show("dictScreen"); });
document.getElementById("rPlayAgain").addEventListener("click", () => startGame());
document.getElementById("logoutBtn").addEventListener("click", () => { UserManager.logout(); Screens.show("loginScreen"); });