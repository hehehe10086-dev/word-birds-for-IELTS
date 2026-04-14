// ===== Word Birds v3: Multi-Book + Ebbinghaus Curve Edition =====

// ══════════════════════════════════════════════════════════
//  WORD BOOKS — dynamically select vocabulary
// ══════════════════════════════════════════════════════════
const WORD_BOOKS = {
  xiaoxue:  { words: null, label: '小学词汇', varName: 'WORDS_XIAOXUE' },
  chuzhong: { words: null, label: '初中词汇', varName: 'WORDS_CHUZHONG' },
  gaozhong: { words: null, label: '高中词汇', varName: 'WORDS_GAOZHONG' },
  kaoyan:   { words: null, label: '考研词汇', varName: 'WORDS_KAOYAN' },
  ielts:    { words: null, label: '雅思词汇', varName: 'WORDS_IELTS' },
};

// Initialize word books from window globals
function initWordBooks() {
  for (const key in WORD_BOOKS) {
    const raw = window[WORD_BOOKS[key].varName] || [];
    WORD_BOOKS[key].words = raw.slice().sort(
      (a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase())
    );
  }
}
initWordBooks();

let currentBook = 'ielts';
let ALL_WORDS = WORD_BOOKS.ielts.words;

function setCurrentBook(bookKey) {
  currentBook = bookKey;
  ALL_WORDS = WORD_BOOKS[bookKey].words;
}

// ══════════════════════════════════════════════════════════
//  EBBINGHAUS REVIEW INTERVALS (milliseconds)
// ══════════════════════════════════════════════════════════
const REVIEW_INTERVALS = [
  5  * 60 * 1000,           // Lv0→1:  5 min
  30 * 60 * 1000,           // Lv1→2:  30 min
  12 * 60 * 60 * 1000,      // Lv2→3:  12 hours
  24 * 60 * 60 * 1000,      // Lv3→4:  1 day
  3  * 24 * 60 * 60 * 1000, // Lv4→5:  3 days
  7  * 24 * 60 * 60 * 1000, // Lv5→perm: 7 days
];
const MAX_LEVEL = 5;

function formatNextReview(nextReview) {
  if (!nextReview) return "";
  const now = Date.now();
  const diff = nextReview - now;
  if (diff <= 0) return "🔔 现在复习";
  if (diff < 60000) return `${Math.ceil(diff/1000)}秒后`;
  if (diff < 3600000) return `${Math.ceil(diff/60000)}分钟后`;
  if (diff < 86400000) return `${(diff/3600000).toFixed(1)}小时后`;
  return `${(diff/86400000).toFixed(1)}天后`;
}

function levelLabel(lv) {
  const labels = ["🌱新","📗Lv1","📘Lv2","📙Lv3","📕Lv4","⭐Lv5","👑永久"];
  return labels[Math.min(lv, 6)] || "🌱新";
}

function levelColor(lv) {
  const colors = ["#94a3b8","#22c55e","#3b82f6","#f59e0b","#ef4444","#a855f7","#fbbf24"];
  return colors[Math.min(lv, 6)] || "#94a3b8";
}

// ══════════════════════════════════════════════════════════
//  USER MANAGER — localStorage per-user persistence
// ══════════════════════════════════════════════════════════
const DEFAULT_WORD = { selected:false, correctFirst:0, mistakes:0, mastered:false,
                       level:0, lastReview:null, nextReview:null, book:null };

const UserManager = {
  currentUser: null,

  _key() { return "wb3_user_" + this.currentUser; },
  _histKey() { return "wb3_hist_" + this.currentUser; },

  login(username) {
    this.currentUser = username.trim().toLowerCase();
    if (!localStorage.getItem(this._key())) {
      localStorage.setItem(this._key(), JSON.stringify({ wordData: {}, created: Date.now() }));
    }
    if (!localStorage.getItem(this._histKey())) {
      localStorage.setItem(this._histKey(), JSON.stringify({ daily: {} }));
    }
    this.decayOverdue();
  },

  logout() { this.currentUser = null; },

  load() {
    try { return JSON.parse(localStorage.getItem(this._key())) || { wordData: {} }; }
    catch(e) { return { wordData: {} }; }
  },

  save(data) {
    try { localStorage.setItem(this._key(), JSON.stringify(data)); } catch(e) {}
  },

  loadHistory() {
    try { return JSON.parse(localStorage.getItem(this._histKey())) || { daily: {} }; }
    catch(e) { return { daily: {} }; }
  },

  saveHistory(hist) {
    try { localStorage.setItem(this._histKey(), JSON.stringify(hist)); } catch(e) {}
  },

  // Record daily learning stats
  recordDaily(correct, wrong) {
    const hist = this.loadHistory();
    const today = new Date().toISOString().slice(0,10);
    if (!hist.daily[today]) hist.daily[today] = { learned: 0, correct: 0, wrong: 0, reviewed: 0 };
    hist.daily[today].learned += correct + wrong;
    hist.daily[today].correct += correct;
    hist.daily[today].wrong += wrong;
    this.saveHistory(hist);
  },

  recordReview(count) {
    const hist = this.loadHistory();
    const today = new Date().toISOString().slice(0,10);
    if (!hist.daily[today]) hist.daily[today] = { learned: 0, correct: 0, wrong: 0, reviewed: 0 };
    hist.daily[today].reviewed += count;
    this.saveHistory(hist);
  },

  getDailyHistory(days) {
    const hist = this.loadHistory();
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      result.push({
        date: key,
        dayLabel: ['日','一','二','三','四','五','六'][d.getDay()],
        ...(hist.daily[key] || { learned: 0, correct: 0, wrong: 0, reviewed: 0 })
      });
    }
    return result;
  },

  _ensure(data, word) {
    if (!data.wordData[word]) data.wordData[word] = { ...DEFAULT_WORD };
    const d = data.wordData[word];
    if (d.level === undefined) d.level = d.mastered ? 5 : 0;
    if (d.lastReview === undefined) d.lastReview = null;
    if (d.nextReview === undefined) d.nextReview = null;
    if (d.book === undefined) d.book = null;
    return d;
  },

  getWordData(word) {
    const data = this.load();
    const d = data.wordData[word];
    if (!d) return { ...DEFAULT_WORD };
    if (d.level === undefined) d.level = d.mastered ? 5 : 0;
    if (d.lastReview === undefined) d.lastReview = null;
    if (d.nextReview === undefined) d.nextReview = null;
    if (d.book === undefined) d.book = null;
    return d;
  },

  setWordSelected(word, selected) {
    const data = this.load();
    this._ensure(data, word);
    data.wordData[word].selected = selected;
    this.save(data);
  },

  batchSetSelected(words, selected) {
    const data = this.load();
    words.forEach(w => {
      this._ensure(data, w);
      data.wordData[w].selected = selected;
    });
    this.save(data);
  },

  recordCorrectFirst(word) {
    const data = this.load();
    const d = this._ensure(data, word);
    d.correctFirst++;
    d.lastReview = Date.now();
    d.book = currentBook;
    if (d.level <= MAX_LEVEL) {
      d.level++;
      if (d.level > MAX_LEVEL) {
        d.mastered = true; d.nextReview = null;
      } else {
        d.nextReview = Date.now() + REVIEW_INTERVALS[d.level - 1];
        d.mastered = false;
      }
    }
    this.save(data);
  },

  recordMistake(word) {
    const data = this.load();
    const d = this._ensure(data, word);
    d.mistakes++;
    d.level = 0; d.mastered = false;
    d.lastReview = Date.now();
    d.nextReview = Date.now() + REVIEW_INTERVALS[0];
    d.book = currentBook;
    this.save(data);
  },

  decayOverdue() {
    const data = this.load();
    const now = Date.now();
    let changed = false;
    for (const word in data.wordData) {
      const d = data.wordData[word];
      if (d.level === undefined) continue;
      if (d.mastered || d.level === 0) continue;
      if (!d.nextReview) continue;
      const interval = REVIEW_INTERVALS[d.level - 1] || REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1];
      const overdueBy = now - d.nextReview;
      if (overdueBy > interval) {
        const levelsDown = Math.min(d.level, Math.floor(overdueBy / interval));
        if (levelsDown > 0) {
          d.level = Math.max(0, d.level - levelsDown);
          d.mastered = false;
          d.nextReview = d.level === 0 ? null : now;
          changed = true;
        }
      }
    }
    if (changed) this.save(data);
  },

  getReviewDueWords() {
    const data = this.load();
    const now = Date.now();
    return ALL_WORDS.filter(w => {
      const d = data.wordData[w.word];
      if (!d || d.mastered) return false;
      return d.level > 0 && d.nextReview && d.nextReview <= now;
    });
  },

  getSelectedWords() {
    const data = this.load();
    return ALL_WORDS.filter(w => data.wordData[w.word]?.selected);
  },

  getAllWordData() { return this.load().wordData; },

  // Get all words with mistakes (for notebook)
  getWrongWords(filterBook) {
    const data = this.load();
    const result = [];
    for (const word in data.wordData) {
      const d = data.wordData[word];
      if (d.mistakes > 0) {
        if (filterBook && d.book !== filterBook) continue;
        // Find meaning from any book
        let meaning = '';
        for (const bk in WORD_BOOKS) {
          const found = WORD_BOOKS[bk].words.find(w => w.word === word);
          if (found) { meaning = found.meaning; break; }
        }
        result.push({ word, meaning, mistakes: d.mistakes, level: d.level || 0,
                       mastered: !!d.mastered, book: d.book });
      }
    }
    return result;
  },

  // Get mastered count for a book
  getBookStats(bookKey) {
    const data = this.load();
    const words = WORD_BOOKS[bookKey].words;
    let mastered = 0, learning = 0;
    words.forEach(w => {
      const d = data.wordData[w.word];
      if (d?.mastered) mastered++;
      else if (d?.level > 0) learning++;
    });
    return { total: words.length, mastered, learning };
  },

  // Get level distribution for Ebbinghaus stats
  getLevelDistribution() {
    const data = this.load();
    const levels = [0,0,0,0,0,0,0]; // lv0-5 + permanent
    for (const word in data.wordData) {
      const d = data.wordData[word];
      if (!d || d.level === undefined) continue;
      if (d.mastered) levels[6]++;
      else levels[Math.min(d.level, 5)]++;
    }
    return levels;
  }
};


// ══════════════════════════════════════════════════════════
//  SCREEN MANAGER
// ══════════════════════════════════════════════════════════
const ALL_SCREENS = ["loginScreen","bookScreen","statsScreen","notebookScreen","dictScreen","resultsScreen"];

const Screens = {
  show(id) {
    ALL_SCREENS.forEach(s => {
      document.getElementById(s).classList.toggle("hidden", s !== id);
    });
    document.getElementById("wrap").style.display = (id === "game") ? "block" : "none";
  },

  showGame() {
    ALL_SCREENS.forEach(s => document.getElementById(s).classList.add("hidden"));
    document.getElementById("wrap").style.display = "block";
  },

  showResults() {
    const report = Session.getReport();
    document.getElementById("rTotal").textContent   = report.total;
    document.getElementById("rCorrect").textContent = report.correct.length;
    document.getElementById("rWrong").textContent   = report.wrong.length;

    const correctList = document.getElementById("rCorrectList");
    const wrongList   = document.getElementById("rWrongList");
    const learnedList = document.getElementById("rLearnedList");
    const userData = UserManager.getAllWordData();

    correctList.innerHTML = report.correct.map(r => {
      const d = userData[r.word] || {};
      const lv = d.mastered ? 6 : (d.level || 0);
      const nxt = d.mastered ? "已永久掌握" : formatNextReview(d.nextReview);
      return `<div class="results-word-detail">
        <span class="results-word-tag tag-correct">${r.word}</span>
        <span class="results-level" style="color:${levelColor(lv)}">${levelLabel(lv)}</span>
        <span class="results-next-review">${nxt}</span>
      </div>`;
    }).join("") || `<span style="color:var(--text-muted);font-size:12px;">无</span>`;

    wrongList.innerHTML = report.wrong.map(r => {
      const d = userData[r.word] || {};
      const lv = d.mastered ? 6 : (d.level || 0);
      const nxt = formatNextReview(d.nextReview);
      return `<div class="results-word-detail">
        <span class="results-word-tag tag-wrong">${r.word}</span>
        <span class="wrong-detail">错${r.wrongCount}次·对${r.correctCount}次</span>
        <span class="results-level" style="color:${levelColor(lv)}">${levelLabel(lv)}</span>
        <span class="results-next-review">${nxt}</span>
      </div>`;
    }).join("") || `<span style="color:var(--text-muted);font-size:12px;">无</span>`;

    learnedList.innerHTML = report.allWords.map(r => {
      const d = userData[r.word] || {};
      const lv = d.mastered ? 6 : (d.level || 0);
      const nxt = d.mastered ? "已永久掌握" : formatNextReview(d.nextReview);
      return `<div class="results-word-detail learned-item">
        <span class="learned-word">${r.word}</span>
        <span class="results-level" style="color:${levelColor(lv)}">${levelLabel(lv)}</span>
        <span class="learned-meaning">${r.meaning}</span>
        <span class="results-next-review">${nxt}</span>
      </div>`;
    }).join("") || `<span style="color:var(--text-muted);font-size:12px;">无</span>`;

    document.getElementById("rCorrectSection").style.display = report.correct.length ? "" : "none";
    document.getElementById("rWrongSection").style.display   = report.wrong.length ? "" : "none";

    const summaryEl = document.getElementById("rSummaryText");
    if (summaryEl) {
      const allDone = GAME_WORDS.length > 0 && MASTERED.size >= GAME_WORDS.length;
      summaryEl.textContent = allDone
        ? `🎉 太棒了！全部 ${report.total} 个词已学完！`
        : `本轮学习了 ${report.total} 个词`;
    }

    // Record daily stats
    UserManager.recordDaily(report.correct.length, report.wrong.length);

    this.show("resultsScreen");
  }
};


// ══════════════════════════════════════════════════════════
//  BOOK SELECTION UI
// ══════════════════════════════════════════════════════════
const BookUI = {
  updateBookCards() {
    const books = ['xiaoxue','chuzhong','gaozhong','kaoyan','ielts'];
    const ids = { xiaoxue:'countXiaoxue', chuzhong:'countChuzhong',
                  gaozhong:'countGaozhong', kaoyan:'countKaoyan', ielts:'countIelts' };
    const progs = { xiaoxue:'progXiaoxue', chuzhong:'progChuzhong',
                    gaozhong:'progGaozhong', kaoyan:'progKaoyan', ielts:'progIelts' };

    books.forEach(bk => {
      const stats = UserManager.getBookStats(bk);
      const el = document.getElementById(ids[bk]);
      if (el) el.textContent = `${stats.total} 词 · 已掌握 ${stats.mastered}`;
      const prog = document.getElementById(progs[bk]);
      if (prog) prog.style.width = (stats.total > 0 ? (stats.mastered / stats.total * 100) : 0) + '%';
    });

    // Today summary
    const today = UserManager.getDailyHistory(1)[0];
    const totalWrong = UserManager.getWrongWords().length;
    document.getElementById("todaySummary").innerHTML = `
      <div class="today-stat">
        <span class="ts-icon">📚</span>
        <div class="ts-info"><div class="ts-num" style="color:var(--blue);">${today.learned}</div><div class="ts-label">今日学习</div></div>
      </div>
      <div class="today-stat">
        <span class="ts-icon">✅</span>
        <div class="ts-info"><div class="ts-num" style="color:var(--green);">${today.correct}</div><div class="ts-label">答对</div></div>
      </div>
      <div class="today-stat">
        <span class="ts-icon">📝</span>
        <div class="ts-info"><div class="ts-num" style="color:var(--red);">${totalWrong}</div><div class="ts-label">错词本</div></div>
      </div>
    `;

    // Update notebook inline badge
    const nbBadge = document.getElementById("nbBadgeInline");
    if (nbBadge) {
      if (totalWrong > 0) {
        nbBadge.style.display = 'inline';
        nbBadge.textContent = totalWrong > 99 ? '99+' : totalWrong;
      } else {
        nbBadge.style.display = 'none';
      }
    }

    document.getElementById("welcomeUser").textContent = `👋 ${UserManager.currentUser}`;
  }
};


// ══════════════════════════════════════════════════════════
//  EBBINGHAUS STATS UI
// ══════════════════════════════════════════════════════════
const StatsUI = {
  render() {
    this.renderWeekGrid();
    this.renderCurve();
    this.renderReviewSchedule();
  },

  renderWeekGrid() {
    const days = UserManager.getDailyHistory(7);
    const maxLearned = Math.max(1, ...days.map(d => d.learned));
    const grid = document.getElementById("weekGrid");
    grid.innerHTML = days.map(d => {
      const intensity = d.learned / maxLearned;
      const bg = d.learned > 0
        ? `rgba(59,130,246,${0.15 + intensity * 0.5})`
        : 'rgba(255,255,255,0.03)';
      const border = d.learned > 0 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)';
      return `<div class="stats-day" style="background:${bg};border:1px solid ${border}">
        <div class="sd-num" style="color:${d.learned > 0 ? '#60a5fa' : 'var(--text-muted)'}">${d.learned}</div>
        <div class="sd-label">周${d.dayLabel}</div>
      </div>`;
    }).join("");
  },

  renderCurve() {
    const canvas = document.getElementById("curveCanvas");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 200 * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    const W = rect.width, H = 200;
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 20, bottom: 30, left: 40 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    // Theoretical Ebbinghaus curve (retention rate)
    // R = e^(-t/S) where S is stability
    const theoryPoints = [];
    const timeLabels = ['0','5m','30m','12h','1d','3d','7d','14d'];
    const timeMins = [0, 5, 30, 720, 1440, 4320, 10080, 20160];
    for (let i = 0; i < timeMins.length; i++) {
      const t = timeMins[i];
      const r = Math.exp(-t / 1440); // base retention
      theoryPoints.push({ x: i / (timeMins.length - 1), y: r });
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ch * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((i * 25) + '%', pad.left - 6, y + 3);
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < timeLabels.length; i++) {
      const x = pad.left + cw * (i / (timeLabels.length - 1));
      ctx.fillText(timeLabels[i], x, H - 8);
    }

    // Draw theoretical curve (gray)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    theoryPoints.forEach((p, i) => {
      const x = pad.left + cw * p.x;
      const y = pad.top + ch * (1 - p.y);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under theory curve
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.lineTo(pad.left, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();

    // User's actual retention curve (based on level distribution)
    const levels = UserManager.getLevelDistribution();
    const totalWords = levels.reduce((a, b) => a + b, 0);
    if (totalWords > 0) {
      // Each level maps to a time point on the x-axis
      // Retention at each review point = words at that level or above / total
      const userPoints = [];
      for (let lv = 0; lv <= 6; lv++) {
        const retained = levels.slice(lv).reduce((a, b) => a + b, 0);
        const x = lv / 6;
        const y = retained / totalWords;
        userPoints.push({ x, y });
      }

      // Draw user curve
      const gradient = ctx.createLinearGradient(pad.left, 0, pad.left + cw, 0);
      gradient.addColorStop(0, '#22c55e');
      gradient.addColorStop(0.5, '#3b82f6');
      gradient.addColorStop(1, '#a855f7');

      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      userPoints.forEach((p, i) => {
        const x = pad.left + cw * p.x;
        const y = pad.top + ch * (1 - p.y);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      userPoints.forEach((p, i) => {
        const x = pad.left + cw * p.x;
        const y = pad.top + ch * (1 - p.y);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = levelColor(i);
        ctx.fill();
        ctx.strokeStyle = '#0a0e1a';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  },

  renderReviewSchedule() {
    const levels = UserManager.getLevelDistribution();
    const total = levels.reduce((a, b) => a + b, 0) || 1;
    const labels = ['🌱 新词 (未学习)', '📗 Lv1 (5分钟)', '📘 Lv2 (30分钟)',
                    '📙 Lv3 (12小时)', '📕 Lv4 (1天)', '⭐ Lv5 (3天)', '👑 永久掌握'];
    const colors = ['#94a3b8','#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#fbbf24'];

    const container = document.getElementById("reviewSchedule");
    container.innerHTML = levels.map((count, i) => {
      const pct = (count / total * 100).toFixed(0);
      return `<div class="review-row">
        <span class="rr-count" style="color:${colors[i]}">${count}</span>
        <span class="rr-label">${labels[i]}</span>
        <div class="rr-bar"><div class="rr-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
      </div>`;
    }).join("");
  }
};


// ══════════════════════════════════════════════════════════
//  WRONG WORD NOTEBOOK UI
// ══════════════════════════════════════════════════════════
const NotebookUI = {
  filter: 'all',

  render() {
    let words;
    if (this.filter === 'current') {
      words = UserManager.getWrongWords(currentBook);
    } else {
      words = UserManager.getWrongWords();
    }

    if (this.filter === 'most') {
      words.sort((a, b) => b.mistakes - a.mistakes);
    } else {
      words.sort((a, b) => a.word.localeCompare(b.word));
    }

    const list = document.getElementById("notebookList");
    if (words.length === 0) {
      list.innerHTML = `<div class="notebook-empty">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <div>还没有错词，继续加油！</div>
      </div>`;
      return;
    }

    list.innerHTML = words.map(w => {
      const lv = w.mastered ? 6 : w.level;
      return `<div class="notebook-word">
        <span class="nw-word">${w.word}</span>
        <span class="nw-meaning">${w.meaning}</span>
        <span class="nw-mistakes">错${w.mistakes}次</span>
        <span class="nw-level" style="color:${levelColor(lv)}">${levelLabel(lv)}</span>
      </div>`;
    }).join("");
  }
};


// ══════════════════════════════════════════════════════════
//  DICTIONARY UI
// ══════════════════════════════════════════════════════════
const DictUI = {
  filter: "all",
  searchTerm: "",
  renderedWords: [],
  flatItems: [],
  ROW_H: 64,
  HDR_H: 32,
  OVERSCAN: 8,
  _scrollRAF: null,
  _inited: false,

  init() {
    if (this._inited) return;
    this._inited = true;

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
      filterReview:    document.getElementById("filterReview"),
      selectAllBtn:    document.getElementById("selectAllVisible"),
      deselectAllBtn:  document.getElementById("deselectAll"),
      reviewBanner:    document.getElementById("reviewBanner"),
      reviewCount:     document.getElementById("reviewBannerCount"),
      reviewStartBtn:  document.getElementById("reviewStartBtn"),
    };

    this.els.body.innerHTML = `<div id="vsTotal" style="position:relative;width:100%;overflow:hidden;"></div>`;
    this.vsTotal = document.getElementById("vsTotal");

    let searchTimer = null;
    this.els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.searchTerm = this.els.search.value.trim().toLowerCase();
        this.rebuild();
      }, 150);
    });

    const setFilter = (f) => { this.filter = f; this.updateFilterBtns(); this.rebuild(); };
    this.els.filterAll.addEventListener("click",     () => setFilter("all"));
    this.els.filterChecked.addEventListener("click",  () => setFilter("checked"));
    this.els.filterWrong.addEventListener("click",    () => setFilter("wrong"));
    this.els.filterMastered.addEventListener("click", () => setFilter("mastered"));
    this.els.filterReview.addEventListener("click",   () => setFilter("review"));

    this.els.selectAllBtn.addEventListener("click", () => {
      const words = this.renderedWords.filter(w => !w._mastered).map(w => w.word);
      UserManager.batchSetSelected(words, true);
      this.rebuild();
    });

    this.els.deselectAllBtn.addEventListener("click", () => {
      UserManager.batchSetSelected(ALL_WORDS.map(w => w.word), false);
      this.rebuild();
    });

    document.getElementById("randomPickBtn").addEventListener("click", () => {
      const input = document.getElementById("randomCount");
      let count = parseInt(input.value, 10);
      if (isNaN(count) || count < 1) { count = 20; input.value = 20; }
      UserManager.batchSetSelected(ALL_WORDS.map(w => w.word), false);
      const userData = UserManager.getAllWordData();
      const unmastered = ALL_WORDS.filter(w => !(userData[w.word]?.mastered));
      const pool = unmastered.length >= count ? unmastered : ALL_WORDS.slice();
      const shuffled = pool.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const picked = shuffled.slice(0, Math.min(count, shuffled.length));
      UserManager.batchSetSelected(picked.map(w => w.word), true);
      this.rebuild();
      const btn = document.getElementById("randomPickBtn");
      btn.textContent = "✅ " + picked.length + " 词";
      setTimeout(() => { btn.textContent = "🎲 随机"; }, 1200);
    });

    this.els.reviewStartBtn.addEventListener("click", () => {
      const dueWords = UserManager.getReviewDueWords();
      if (dueWords.length < 3) { alert("待复习词少于3个，请稍后再来！"); return; }
      UserManager.batchSetSelected(ALL_WORDS.map(w => w.word), false);
      UserManager.batchSetSelected(dueWords.map(w => w.word), true);
      this.rebuild();
      document.getElementById("startGameBtn").click();
    });

    this.els.body.addEventListener("scroll", () => {
      if (this._scrollRAF) return;
      this._scrollRAF = requestAnimationFrame(() => { this._scrollRAF = null; this.paint(); });
    }, { passive: true });

    this.els.body.addEventListener("click", (e) => {
      const row = e.target.closest(".word-row");
      if (!row) return;
      const word = row.dataset.word;
      if (!word) return;
      const d = UserManager.getWordData(word);
      UserManager.setWordSelected(word, !d.selected);
      const item = this.flatItems.find(it => it.type === "word" && it.w.word === word);
      if (item) item.w._selected = !d.selected;
      row.classList.toggle("checked", !d.selected);
      row.querySelector(".word-check").textContent = !d.selected ? "✓" : "";
      this.updateStats();
    });

    this.updateFilterBtns();
  },

  onBookChange() {
    document.getElementById("dictTitle").textContent = "📖 " + WORD_BOOKS[currentBook].label;
    this.els.search.value = '';
    this.searchTerm = '';
    this.filter = 'all';
    this.updateFilterBtns();
    this.buildLetterNav();
    this.rebuild();
  },

  updateFilterBtns() {
    [this.els.filterAll, this.els.filterChecked, this.els.filterWrong, this.els.filterMastered, this.els.filterReview]
      .forEach(b => b.classList.remove("active"));
    ({ all: this.els.filterAll, checked: this.els.filterChecked,
       wrong: this.els.filterWrong, mastered: this.els.filterMastered,
       review: this.els.filterReview
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
      btn.addEventListener("click", () => this.scrollToLetter(letter));
      this.els.letterNav.appendChild(btn);
    }
  },

  scrollToLetter(letter) {
    const idx = this.flatItems.findIndex(it => it.type === "letter" && it.letter === letter);
    if (idx < 0) return;
    let px = 0;
    for (let i = 0; i < idx; i++) px += this.flatItems[i].type === "word" ? this.ROW_H : this.HDR_H;
    this.els.body.scrollTop = px;
  },

  getFilteredWords() {
    const userData = UserManager.getAllWordData();
    const now = Date.now();
    let words = ALL_WORDS.map(w => {
      const d = userData[w.word] || {};
      const level = d.level || 0;
      const nextReview = d.nextReview || null;
      const isDue = !d.mastered && level > 0 && nextReview && nextReview <= now;
      return { ...w, _selected: !!d.selected, _mastered: !!d.mastered,
               _mistakes: d.mistakes || 0, _correctFirst: d.correctFirst || 0,
               _level: level, _nextReview: nextReview, _isDue: isDue };
    });
    if (this.searchTerm) {
      words = words.filter(w =>
        w.word.toLowerCase().includes(this.searchTerm) ||
        w.meaning.includes(this.searchTerm));
    }
    if (this.filter === "checked")  words = words.filter(w => w._selected);
    if (this.filter === "wrong")    words = words.filter(w => w._mistakes > 0 && !w._mastered);
    if (this.filter === "mastered") words = words.filter(w => w._mastered);
    if (this.filter === "review")   words = words.filter(w => w._isDue);
    return { active: words.filter(w => !w._mastered), mastered: words.filter(w => w._mastered) };
  },

  rebuild() {
    const { active, mastered } = this.getFilteredWords();
    this.renderedWords = [...active, ...mastered];
    this.flatItems = [];
    let curLetter = "";
    active.forEach(w => {
      const fl = w.word[0].toUpperCase();
      if (fl !== curLetter) { curLetter = fl; this.flatItems.push({ type: "letter", letter: fl }); }
      this.flatItems.push({ type: "word", w, mastered: false });
    });
    if (mastered.length > 0) {
      this.flatItems.push({ type: "divider", count: mastered.length });
      curLetter = "";
      mastered.forEach(w => {
        const fl = w.word[0].toUpperCase();
        if (fl !== curLetter) { curLetter = fl; this.flatItems.push({ type: "letter", letter: "m-" + fl, display: fl }); }
        this.flatItems.push({ type: "word", w, mastered: true });
      });
    }
    let totalH = 0;
    this.flatItems.forEach(it => { totalH += it.type === "word" ? this.ROW_H : this.HDR_H; });
    this.vsTotal.style.height = totalH + "px";
    this.updateStats();
    this.els.body.scrollTop = 0;
    this.paint();
  },

  updateStats() {
    const userData = UserManager.getAllWordData();
    const now = Date.now();
    let selectedCount = 0, masteredCount = 0, reviewDueCount = 0;
    ALL_WORDS.forEach(w => {
      const d = userData[w.word];
      if (d?.selected) selectedCount++;
      if (d?.mastered) masteredCount++;
      if (d && !d.mastered && d.level > 0 && d.nextReview && d.nextReview <= now) reviewDueCount++;
    });
    this.els.stats.textContent = `已选 ${selectedCount} · 掌握 ${masteredCount} · 共 ${ALL_WORDS.length}`;
    this.els.startBtn.disabled = selectedCount < 3;
    if (reviewDueCount > 0) {
      this.els.reviewBanner.style.display = "flex";
      this.els.reviewCount.textContent = reviewDueCount;
      this.els.reviewStartBtn.disabled = reviewDueCount < 3;
    } else {
      this.els.reviewBanner.style.display = "none";
    }
  },

  paint() {
    const scrollTop = this.els.body.scrollTop;
    const viewH = this.els.body.clientHeight;
    const items = this.flatItems;
    const ROW_H = this.ROW_H, HDR_H = this.HDR_H, OVERSCAN = this.OVERSCAN;
    let y = 0, startIdx = -1, endIdx = items.length;
    for (let i = 0; i < items.length; i++) {
      const h = items[i].type === "word" ? ROW_H : HDR_H;
      if (startIdx < 0 && y + h > scrollTop - OVERSCAN * ROW_H) startIdx = i;
      if (y > scrollTop + viewH + OVERSCAN * ROW_H) { endIdx = i; break; }
      y += h;
    }
    if (startIdx < 0) startIdx = 0;
    let topOffset = 0;
    for (let i = 0; i < startIdx; i++) topOffset += items[i].type === "word" ? ROW_H : HDR_H;

    const parts = [];
    for (let i = startIdx; i < endIdx; i++) {
      const it = items[i];
      if (it.type === "letter") {
        parts.push(`<div class="letter-group" style="height:${HDR_H}px;line-height:${HDR_H}px;">${it.display || it.letter}</div>`);
      } else if (it.type === "divider") {
        parts.push(`<div class="mastered-divider" style="height:${HDR_H}px;line-height:${HDR_H}px;">✅ 已掌握 (${it.count} 词)</div>`);
      } else {
        parts.push(this.wordRowHTML(it.w, it.mastered));
      }
    }

    if (items.length === 0) {
      this.vsTotal.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">没有找到词语</div>`;
      return;
    }

    this.vsTotal.innerHTML =
      `<div style="height:${topOffset}px;"></div>` +
      parts.join("") +
      `<div style="height:0px;"></div>`;
  },

  wordRowHTML(w, isMastered) {
    const checkedClass = w._selected ? " checked" : "";
    const masteredClass = isMastered ? " mastered-row" : "";
    const dueClass = w._isDue ? " due-row" : "";
    const lv = w._mastered ? 6 : (w._level || 0);
    const lvText = levelLabel(lv);
    const lvCol = levelColor(lv);

    let statusHTML = "";
    if (w._mastered) {
      statusHTML = `<div class="word-meta"><span class="word-level" style="color:${lvCol}">${lvText}</span></div>`;
    } else if (w._level > 0) {
      const reviewText = formatNextReview(w._nextReview);
      statusHTML = `<div class="word-meta"><span class="word-level" style="color:${lvCol}">${lvText}</span>
        <span class="word-review-time">${reviewText}</span></div>`;
    } else if (w._mistakes > 0) {
      statusHTML = `<div class="word-meta"><span class="word-level" style="color:${lvCol}">${lvText}</span>
        <span class="word-review-time">错${w._mistakes}次</span></div>`;
    }

    const pct = Math.min(100, (lv / 6) * 100);
    const barHTML = lv > 0 ? `<div class="level-bar"><div class="level-bar-fill" style="width:${pct}%;background:${lvCol}"></div></div>` : "";

    return `<div class="word-row${checkedClass}${masteredClass}${dueClass}" data-word="${w.word}" style="height:${this.ROW_H}px;">
      <div class="word-check">${w._selected ? "✓" : ""}</div>
      <div class="word-info">
        <div class="word-en">${w.word}</div>
        <div class="word-cn">${w.meaning}</div>
        ${barHTML}
      </div>
      ${statusHTML}</div>`;
  },

  render() { this.rebuild(); }
};


// ══════════════════════════════════════════════════════════
//  SESSION TRACKER
// ══════════════════════════════════════════════════════════
const Session = {
  wordStats: {},
  order: [],
  active: false,

  start() {
    this.wordStats = {};
    this.order = [];
    this.active = true;
  },

  record(word, meaning, correct) {
    if (!this.wordStats[word]) {
      this.wordStats[word] = { meaning, wrongCount: 0, correctCount: 0, firstResult: correct ? 'correct' : 'wrong' };
      this.order.push(word);
    }
    if (correct) {
      this.wordStats[word].correctCount++;
      UserManager.recordCorrectFirst(word);
    } else {
      this.wordStats[word].wrongCount++;
      UserManager.recordMistake(word);
    }
  },

  getReport() {
    const allWords = this.order.map(w => ({ word: w, ...this.wordStats[w] }));
    return {
      total: allWords.length,
      correct: allWords.filter(w => w.firstResult === 'correct'),
      wrong: allWords.filter(w => w.firstResult === 'wrong'),
      allWords
    };
  }
};


// ══════════════════════════════════════════════════════════
//  GAME WORD POOL
// ══════════════════════════════════════════════════════════
let GAME_WORDS = [];
const MASTERED     = new Set();
const CORRECT_CNT  = {};
const REVENGE_POOL = [];
const WRONG_WORDS  = new Set();
let lastPickedWord = null;

function initGamePool() {
  GAME_WORDS = UserManager.getSelectedWords();
  MASTERED.clear();
  WRONG_WORDS.clear();
  lastPickedWord = null;
  for (const k in CORRECT_CNT) delete CORRECT_CNT[k];
  REVENGE_POOL.length = 0;
}

function markCorrect(wordObj) {
  const w = wordObj.word;
  CORRECT_CNT[w] = (CORRECT_CNT[w] || 0) + 1;
  const threshold = WRONG_WORDS.has(w) ? 3 : 1;
  if (CORRECT_CNT[w] >= threshold) {
    MASTERED.add(w);
    const idx = REVENGE_POOL.findIndex(r => r.word === w);
    if (idx >= 0) REVENGE_POOL.splice(idx, 1);
  }
}

function addToRevenge(wordObj) {
  WRONG_WORDS.add(wordObj.word);
  if (MASTERED.has(wordObj.word)) return;
  const ex = REVENGE_POOL.find(r => r.word === wordObj.word);
  if (ex) {
    ex.immediate = Math.max(ex.immediate, 2);
    ex.totalLeft = Math.max(ex.totalLeft, 10);
  } else {
    REVENGE_POOL.push({ word: wordObj.word, meaning: wordObj.meaning,
      immediate: 2, questionsSince: 0, totalLeft: 10 });
  }
}

function tickRevenge() {
  REVENGE_POOL.forEach(r => { if (r.immediate === 0) r.questionsSince++; });
}

function pickCorrectWord() {
  const avoidWord = lastPickedWord;
  const canAvoid = (w) => !avoidWord || w.word !== avoidWord;

  const imCandidates = REVENGE_POOL.filter(r => r.immediate > 0 && canAvoid(r));
  let imIdx = imCandidates.length > 0 ? REVENGE_POOL.indexOf(imCandidates[0]) : -1;
  if (imIdx < 0) {
    imIdx = REVENGE_POOL.findIndex(r => r.immediate > 0);
    const pool = GAME_WORDS.filter(w => !MASTERED.has(w.word) && canAvoid(w));
    if (pool.length > 0 && imIdx >= 0 && REVENGE_POOL[imIdx].word === avoidWord) imIdx = -1;
  }
  if (imIdx >= 0) {
    const r = REVENGE_POOL[imIdx];
    r.immediate--; r.totalLeft--;
    if (r.totalLeft <= 0) REVENGE_POOL.splice(imIdx, 1);
    lastPickedWord = r.word;
    return { word: r.word, meaning: r.meaning };
  }

  const spCandidates = REVENGE_POOL.filter(r => r.immediate === 0 && r.questionsSince >= 5 && canAvoid(r));
  let spIdx = spCandidates.length > 0 ? REVENGE_POOL.indexOf(spCandidates[0]) : -1;
  if (spIdx >= 0) {
    const r = REVENGE_POOL[spIdx];
    r.questionsSince = 0; r.totalLeft--;
    if (r.totalLeft <= 0) REVENGE_POOL.splice(spIdx, 1);
    lastPickedWord = r.word;
    return { word: r.word, meaning: r.meaning };
  }

  let pool = GAME_WORDS.filter(w => !MASTERED.has(w.word) && canAvoid(w));
  if (pool.length === 0) pool = GAME_WORDS.filter(w => !MASTERED.has(w.word));
  if (pool.length > 0) {
    const pick = Phaser.Utils.Array.GetRandom(pool);
    lastPickedWord = pick.word;
    return pick;
  }
  const allPool = GAME_WORDS.filter(w => canAvoid(w));
  const finalPool = allPool.length > 0 ? allPool : GAME_WORDS;
  if (finalPool.length > 0) {
    const pick = Phaser.Utils.Array.GetRandom(finalPool);
    lastPickedWord = pick.word;
    return pick;
  }
  const pick = Phaser.Utils.Array.GetRandom(ALL_WORDS);
  lastPickedWord = pick.word;
  return pick;
}


// ══════════════════════════════════════════════════════════
//  GAME ENGINE (Phaser)
// ══════════════════════════════════════════════════════════
const W = 1100, H = 620;
function shuffle(arr) { return Phaser.Utils.Array.Shuffle(arr.slice()); }
function randPick(arr) { return Phaser.Utils.Array.GetRandom(arr); }

function makeQuestion() {
  tickRevenge();
  const correct = pickCorrectWord();
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

function speakWord(word) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    const findVoice = (lang) => voices.find(v => v.lang === lang) ||
                                voices.find(v => v.lang.startsWith(lang.split('-')[0]+'-'+lang.split('-')[1])) ||
                                voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    const ukUtter = new SpeechSynthesisUtterance(word);
    ukUtter.lang = 'en-GB'; ukUtter.rate = 0.85;
    const ukVoice = findVoice('en-GB');
    if (ukVoice) ukUtter.voice = ukVoice;
    const usUtter = new SpeechSynthesisUtterance(word);
    usUtter.lang = 'en-US'; usUtter.rate = 0.85;
    const usVoice = findVoice('en-US');
    if (usVoice) usUtter.voice = usVoice;
    ukUtter.onend = () => { setTimeout(() => window.speechSynthesis.speak(usUtter), 350); };
    window.speechSynthesis.speak(ukUtter);
  } catch(e) { console.warn("TTS error:", e); }
}

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
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
    this.birdCycle=["RED","BLUE","GREEN","YELLOW","ORANGE","PURPLE","PINK","CYAN","TEAL","BLACK"];
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
    this.birds = this.physics.add.group();
    this.pigMeta = [];
    this.add.rectangle(W/2, 46, W, 92, 0x000000, 0.35).setDepth(3);
    this.wordText = this.add.text(20, 8, "", { fontSize:"32px", color:"#ffffff", fontStyle:"bold", stroke:"#1e293b", strokeThickness:4 }).setDepth(5);
    this.levelText = this.add.text(20, 50, "", { fontSize:"13px", color:"#94d4ff" }).setDepth(5);
    this.tipText = this.add.text(20, 68, "", { fontSize:"13px", color:"#d1fae5" }).setDepth(5);
    this.scoreText = this.add.text(W-220, 8, "Score: 0", { fontSize:"22px", color:"#fbbf24", fontStyle:"bold" }).setDepth(5);
    this.streakText = this.add.text(W-220, 38, "", { fontSize:"20px", color:"#f59e0b" }).setDepth(5);
    this.birdLabel = this.add.text(W-220, 62, "", { fontSize:"13px", color:"#a5f3fc" }).setDepth(5);
    this.masteredText = this.add.text(W/2, 10, "", { fontSize:"13px", color:"#86efac", align:"center" }).setOrigin(0.5,0).setDepth(5);
    const TY = 90;
    this.add.rectangle(W/2, TY, W, 8, 0x1e293b, 0.6).setDepth(4);
    this.timerBar = this.add.rectangle(0, TY, W, 8, 0x22c55e).setOrigin(0,0.5).setDepth(5);
    this.timerNum = this.add.text(W-6, TY, "10", { fontSize:"11px", color:"#e2e8f0", fontStyle:"bold" }).setOrigin(1,0.5).setDepth(5);
    this.banner = this.add.text(W/2, 155, "", { fontSize:"58px", fontStyle:"bold", color:"#ffffff", stroke:"#1e293b", strokeThickness:10 }).setOrigin(0.5).setAlpha(0).setDepth(12);
    this.revealBg = this.add.rectangle(W/2, H/2, 580, 140, 0x0f172a, 0.96).setStrokeStyle(2, 0xfbbf24).setDepth(22).setAlpha(0);
    this.revealLine1 = this.add.text(W/2, H/2-28, "", { fontSize:"24px", fontStyle:"bold", color:"#fbbf24", align:"center", wordWrap:{width:550} }).setOrigin(0.5).setDepth(23).setAlpha(0);
    this.revealLine2 = this.add.text(W/2, H/2+20, "", { fontSize:"18px", color:"#e2e8f0", align:"center", wordWrap:{width:550} }).setOrigin(0.5).setDepth(23).setAlpha(0);
    this.makeButton(80, H-22, 130, 34, "⏭ 下一题", ()=>{ safeResumeAudio(this); this.finishRoundAndNext(); });
    this.studyBtn = this.makeButton(225, H-22, 160, 34, "📚 学习模式 OFF", ()=>{ safeResumeAudio(this); this.toggleStudyMode(); });
    this.makeButton(410, H-22, 130, 34, "📊 结束学习", ()=>{ safeResumeAudio(this); this.endSession(); });
    this.input.on("pointerdown", ()=>{ safeResumeAudio(this); });
    this.bindDrag();
    this.newRound();
  }

  endSession() {
    this.stopTimer(); this.roundFinished = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (gameInstance) { gameInstance.destroy(true); gameInstance = null; }
    document.getElementById("wrap").style.display = "none";
    Screens.showResults();
  }

  drawSky() {
    const g = this.add.graphics();
    for (let i=0;i<H;i++){
      const t=i/H;
      const r=Math.round(Phaser.Math.Linear(0x87,0xc8,t));
      const grn=Math.round(Phaser.Math.Linear(0xce,0xe8,t));
      const b=Math.round(Phaser.Math.Linear(0xeb,0xff,t));
      g.fillStyle((r<<16)|(grn<<8)|b,1); g.fillRect(0,i,W,1);
    }
    g.setDepth(0);
  }

  spawnClouds() {
    const cloudY=[80,130,100,160,90], cloudX=[100,280,500,720,950], sizes=[0.8,1.1,0.7,1.3,0.9];
    cloudX.forEach((cx,i)=>{
      const g=this.add.graphics().setDepth(1).setAlpha(0.75);
      const s=sizes[i];
      g.fillStyle(0xffffff);
      g.fillEllipse(cx,cloudY[i],80*s,35*s);
      g.fillEllipse(cx+28*s,cloudY[i]-14*s,55*s,38*s);
      g.fillEllipse(cx-24*s,cloudY[i]-10*s,50*s,30*s);
      g.fillEllipse(cx+52*s,cloudY[i],45*s,28*s);
      this.tweens.add({ targets:g, x:"+="+(18+i*6), duration:8000+i*1500, yoyo:true, repeat:-1, ease:"Sine.easeInOut" });
    });
  }

  toggleStudyMode() {
    this.studyMode=!this.studyMode;
    this.studyBtn.lb.setText("📚 学习模式 "+(this.studyMode?"ON ✓":"OFF"));
    this.studyBtn.bg.setFillStyle(this.studyMode?0x0284c7:0x1e293b);
  }

  makeTextures() {
    if (this.textures.exists("wood")) return;
    let g=this.add.graphics();
    g.fillStyle(0xb7791f); g.fillRoundedRect(0,0,115,24,7);
    g.fillStyle(0xd4a843,0.5); g.fillRoundedRect(3,3,109,10,5);
    g.lineStyle(3,0x7a4a12); g.strokeRoundedRect(0,0,115,24,7);
    g.generateTexture("wood",115,24); g.destroy();
    g=this.add.graphics();
    g.fillStyle(0x7c8fa0); g.fillRoundedRect(0,0,105,28,7);
    g.fillStyle(0xaabbc8,0.4); g.fillRoundedRect(3,3,99,12,5);
    g.lineStyle(3,0x4e6070); g.strokeRoundedRect(0,0,105,28,7);
    g.generateTexture("stone",105,28); g.destroy();
    g=this.add.graphics();
    g.fillStyle(0xffc24b); g.fillCircle(6,6,6);
    g.generateTexture("spark",12,12); g.destroy();
  }

  makeBirdContainer(x,y,type="RED") {
    const CFG={
      RED:{body:0xff3b3b,stroke:0xb91c1c,belly:0xffa0a0,brow:0x7f1d1d,beak:0xfbbf24},
      BLUE:{body:0x3b82f6,stroke:0x1d4ed8,belly:0x93c5fd,brow:0x1e3a8a,beak:0xfbbf24},
      BLACK:{body:0x1e293b,stroke:0x000000,belly:0x475569,brow:0x64748b,beak:0xfcd34d},
      GREEN:{body:0x22c55e,stroke:0x15803d,belly:0x86efac,brow:0x14532d,beak:0xfde68a},
      YELLOW:{body:0xfbbf24,stroke:0xb45309,belly:0xfde68a,brow:0x78350f,beak:0xef4444},
      ORANGE:{body:0xf97316,stroke:0x9a3412,belly:0xfdba74,brow:0x7c2d12,beak:0xfef08a},
      PURPLE:{body:0xa855f7,stroke:0x6b21a8,belly:0xd8b4fe,brow:0x3b0764,beak:0xfef9c3},
      PINK:{body:0xec4899,stroke:0xbe185d,belly:0xf9a8d4,brow:0x831843,beak:0xfef08a},
      CYAN:{body:0x06b6d4,stroke:0x0e7490,belly:0x67e8f9,brow:0x164e63,beak:0xfde68a},
      TEAL:{body:0x14b8a6,stroke:0x0f766e,belly:0x5eead4,brow:0x134e4a,beak:0xfef9c3},
    };
    const c=CFG[type]||CFG.RED;
    const sz=type==="YELLOW"?28:type==="ORANGE"?26:23;
    const children=[
      this.add.circle(0,0,sz,c.body).setStrokeStyle(3,c.stroke),
      this.add.ellipse(5,11,sz-2,16,c.belly).setAlpha(0.55),
      this.add.circle(7,-7,10,0xffffff), this.add.circle(10,-7,4,0x111827),
      this.add.circle(8,-9,2,0xffffff,0.8),
      this.add.rectangle(7,-sz-1,26,6,c.brow).setAngle(-12),
      this.add.triangle(15,4,0,0,18,7,0,14,c.beak).setStrokeStyle(2,0xd97706),
    ];
    const ct=this.add.container(x,y,children); ct.setSize(80,80);
    return ct;
  }

  makePig(x,y) {
    const ct=this.add.container(x,y,[
      this.add.ellipse(3,5,58,22,0x000000,0.15),
      this.add.circle(0,0,27,0x4ade80).setStrokeStyle(3,0x16a34a),
      this.add.ellipse(7,11,30,20,0x86efac).setStrokeStyle(2,0x22c55e),
      this.add.circle(1,11,3.5,0x14532d), this.add.circle(13,11,3.5,0x14532d),
      this.add.circle(-9,-7,8,0xffffff), this.add.circle(-7,-7,3.5,0x111827),
      this.add.circle(9,-7,8,0xffffff), this.add.circle(11,-7,3.5,0x111827),
      this.add.circle(-8,-9,2,0xffffff,0.8), this.add.circle(10,-9,2,0xffffff,0.8),
    ]); ct.setSize(80,80);
    return ct;
  }

  makeButton(x,y,w,h,text,onClick) {
    const bg=this.add.rectangle(x,y,w,h,0x1e293b,0.92).setInteractive({useHandCursor:true}).setStrokeStyle(1,0x475569).setDepth(5);
    const lb=this.add.text(x,y,text,{fontSize:"14px",color:"#f1f5f9"}).setOrigin(0.5).setDepth(6);
    bg.on("pointerdown",()=>{bg.setScale(0.96);onClick();});
    bg.on("pointerup",()=>bg.setScale(1));
    bg.on("pointerover",()=>bg.setFillStyle(0x334155,0.95));
    bg.on("pointerout",()=>{bg.setScale(1);bg.setFillStyle(0x1e293b,0.92);});
    return {bg,lb};
  }

  lockBlocks(locked) {
    this.blocks.getChildren().forEach(b=>{
      if(!b?.body)return;
      b.body.setAllowGravity(!locked); b.setImmovable(locked);
      if(locked){b.body.setVelocity(0,0); if(typeof b.body.angularVelocity==="number")b.body.angularVelocity=0; else b.body.setAngularVelocity?.(0);}
    });
  }

  spawnLevelBlocks() {
    const lv=Math.min(this.level,6); const B=[H-23,H-50]; const scale=W/900;
    const layouts=[
      [[535*scale,B[0],"wood"],[645*scale,B[0],"wood"]],
      [[530*scale,B[0],"wood"],[530*scale,B[1],"stone"],[650*scale,B[0],"stone"]],
      [[520*scale,B[0],"stone"],[520*scale,B[1],"wood"],[635*scale,B[0],"wood"],[635*scale,B[1],"stone"]],
      [[515*scale,B[0],"wood"],[515*scale,B[1],"stone"],[580*scale,B[0],"stone"],[645*scale,B[0],"wood"],[645*scale,B[1],"wood"]],
      [[510*scale,B[0],"stone"],[510*scale,B[1],"wood"],[570*scale,B[0],"wood"],[570*scale,B[1],"stone"],[632*scale,B[0],"stone"],[632*scale,B[1],"wood"]],
      [[505*scale,B[0],"wood"],[505*scale,B[1],"stone"],[558*scale,B[0],"stone"],[558*scale,B[1],"wood"],[612*scale,B[0],"wood"],[612*scale,B[1],"stone"],[662*scale,B[0],"stone"]],
    ];
    (layouts[lv-1]||layouts[layouts.length-1]).forEach(([x,y,type])=>{
      const b=this.blocks.create(x,y,type);
      if(type==="wood")b.setBounce(0.02).setDrag(0.92,0.92).setMass(2);
      else b.setBounce(0.01).setDrag(0.90,0.90).setMass(3.2);
      b.setCollideWorldBounds(true);
    });
    this.lockBlocks(true);
  }

  spawnMainBird() {
    this.birds.clear(true,true);
    const bird=this.makeBirdContainer(this.anchor.x,this.anchor.y,this.birdType);
    this.physics.add.existing(bird);
    const r=this.birdType==="YELLOW"?28:this.birdType==="ORANGE"?26:23;
    bird.body.setCircle(r,-r,-r).setCollideWorldBounds(true).setBounce(0.45).setDrag(0.35,0.35).setAllowGravity(false);
    this.physics.add.collider(bird,this.ground);
    this.physics.add.collider(bird,this.blocks);
    bird.setInteractive(new Phaser.Geom.Circle(0,0,90),Phaser.Geom.Circle.Contains);
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
    if(this._dragBound)return; this._dragBound=true;
    this.input.on("dragstart",()=>{
      if(this.roundFinished||this.launched||this.studyPreviewing)return;
      safeResumeAudio(this); this.dragging=true;
      this.bird.body.setVelocity(0,0).setAllowGravity(false); this.bird.body.moves=false;
      beep(this,520,0.05,"sine",0.03);
    });
    this.input.on("drag",(pointer,obj,dragX,dragY)=>{
      if(!this.dragging||this.roundFinished||this.launched)return;
      const nx=Phaser.Math.Linear(obj.x,dragX,1-this.DRAG_SMOOTH);
      const ny=Phaser.Math.Linear(obj.y,dragY,1-this.DRAG_SMOOTH);
      const v=new Phaser.Math.Vector2(nx-this.anchor.x,ny-this.anchor.y);
      const dist=v.length();
      if(dist>this.MAX_PULL)v.normalize().scale(this.MAX_PULL);
      obj.x=this.anchor.x+v.x; obj.y=this.anchor.y+v.y;
      this.drawBandAndTrajectory(obj.x,obj.y);
    });
    this.input.on("dragend",()=>{
      if(!this.dragging||this.roundFinished||this.launched)return;
      this.dragging=false;
      const pull=new Phaser.Math.Vector2(this.bird.x-this.anchor.x,this.bird.y-this.anchor.y);
      const vel=pull.clone().scale(-this.POWER);
      this.lockBlocks(false);
      this.bird.body.moves=true;
      this.bird.body.setAllowGravity(true).setGravityY(this.GRAVITY_Y);
      this.bird.body.setVelocity(vel.x,vel.y);
      this.launched=true;
      this.bandGfx.clear(); this.trajGfx.clear();
      this.stopTimer();
      const myRound=this.roundId;
      this.time.delayedCall(4500,()=>{
        if(this.roundId!==myRound||this.roundFinished)return;
        this.onChoose(false,W/2,H/2,null);
      });
      beep(this,780,0.06,"square",0.05);
    });
  }

  startTimer() {
    if(this.timerActive)return;
    this.timerActive=true; this.timeLeft=10; this.updateTimerVisual();
    this.timerEvent=this.time.addEvent({
      delay:1000, repeat:9,
      callback:()=>{
        if(!this.timerActive)return;
        this.timeLeft=Math.max(0,this.timeLeft-1); this.updateTimerVisual();
        if(this.timeLeft<=3&&this.timeLeft>0)beep(this,440,0.05,"square",0.03);
        if(this.timeLeft===0&&!this.launched&&!this.roundFinished){
          this.timerActive=false;
          this.showBanner("⏰ 超时！","#94a3b8");
          this.time.delayedCall(300,()=>this.onChoose(false,W/2,H/2,null));
        }
      }
    });
  }

  stopTimer() {
    this.timerActive=false;
    if(this.timerEvent){this.timerEvent.remove();this.timerEvent=null;}
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
    for(let i=1;i<=30;i++){
      const t=i*0.075,px=x+v0.x*t,py=y+v0.y*t+0.5*g*t*t;
      if(px<0||px>W||py<0||py>H)break;
      this.trajGfx.fillCircle(px,py,3.5);
    }
  }

  spawnPigs() {
    const bubCX=Math.round(W*0.70); const pigX=Math.round(W*0.90);
    const ys=[168,340,512]; const bubW=290,bubH=96;
    const colors=[0x3b82f6,0xf59e0b,0xa855f7]; const moving=this.level>=3;
    this.q.choices.forEach((c,i)=>{
      const y=ys[i];
      const pig=this.makePig(pigX,y);
      this.tweens.add({targets:pig,scaleY:0.9,duration:500+i*80,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
      const bx=bubCX-bubW/2,by=y-bubH/2;
      const bubble=this.add.graphics().setDepth(2);
      bubble.fillStyle(0xffffff,0.98);
      bubble.fillRoundedRect(bx,by,bubW,bubH,12);
      bubble.fillStyle(colors[i],1);
      bubble.fillRoundedRect(bx,by,8,bubH,{tl:12,bl:12,tr:0,br:0});
      bubble.lineStyle(2,0xc0c8d4,1);
      bubble.strokeRoundedRect(bx,by,bubW,bubH,12);
      const label=this.add.text(bubCX+6,y,c.text,{
        fontSize:"15px",color:"#1e293b",fontFamily:'-apple-system,"Microsoft YaHei","PingFang SC",sans-serif',
        fontStyle:"600",align:"center",lineSpacing:4,wordWrap:{width:bubW-36,useAdvancedWrap:true},padding:{top:2,bottom:2}
      }).setOrigin(0.5).setDepth(3);
      let moveTween=null;
      if(moving){
        const range=38+i*12;
        moveTween=this.tweens.add({targets:pig,x:"+="+range,duration:950+i*260,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
      }
      this.pigMeta.push({pig,label,bubble,ok:c.ok,alive:true,moveTween});
    });
  }

  update() {
    if(this.roundFinished||!this.launched)return;
    this.birds.getChildren().forEach(birdObj=>{
      if(!birdObj?.active)return;
      this.pigMeta.forEach(pm=>{
        if(!pm.alive)return;
        if(Phaser.Math.Distance.Between(birdObj.x,birdObj.y,pm.pig.x,pm.pig.y)<65){
          pm.alive=false; this.onChoose(pm.ok,pm.pig.x,pm.pig.y,pm);
        }
      });
    });
  }

  onChoose(ok,hitX,hitY,pm) {
    if(this.roundFinished)return;
    this.roundFinished=true; this.stopTimer();
    this.cameras.main.shake(80,0.006);
    if(ok){
      this.streak++; this.questionCount++;
      const add=10+Math.min(20,this.streak*2);
      this.score+=add; this.scoreText.setText("Score: "+this.score);
      this.updateStreakDisplay();
      markCorrect(this.q.correct);
      this.masteredText.setText(MASTERED.size>0?"✅ 已掌握 "+MASTERED.size+" 词":"");
      Session.record(this.q.correct.word,this.q.correct.meaning,true);
      if(pm?.pig)this.pigFlyOff(pm);
      let txt="✅ CORRECT!",col="#065f46";
      if(this.streak>=8){txt="🏆 PERFECT!!!";col="#7c3aed";}
      else if(this.streak>=5){txt="⚡ COMBO ×"+this.streak+"!";col="#dc2626";}
      else if(this.streak>=3){txt="🎯 NICE SHOT!";col="#d97706";}
      else if(this.streak>=2){txt="✅ ×"+this.streak+" 连击";col="#0369a1";}
      this.showBanner(txt,col);
      this.tipText.setText("✅ +"+add+"  连击 ×"+this.streak);
      this.cameras.main.setBackgroundColor(this.bgPalette[Math.min(Math.floor(this.streak/2),this.bgPalette.length-1)]);
      beep(this,920,0.09,"sine",0.06);
      if(this.streak>=3)beep(this,1100+this.streak*40,0.06,"sine",0.04);
      const myRound=this.roundId;
      this.time.delayedCall(1100,()=>{if(this.roundId===myRound)this.finishRoundAndNext();});
    } else {
      this.streak=0;
      this.cameras.main.setBackgroundColor(this.bgPalette[0]);
      this.updateStreakDisplay();
      if(this.launched&&this.bird?.body)this.birdBounceBack();
      this.tipText.setText("❌ 答错了！看正确答案...");
      this.showBanner("❌ WRONG!","#991b1b");
      beep(this,220,0.14,"sawtooth",0.06);
      addToRevenge(this.q.correct);
      Session.record(this.q.correct.word,this.q.correct.meaning,false);
      this.showReveal(this.q.correct.word,this.q.correct.meaning);
      const myRound=this.roundId;
      this.time.delayedCall(2700,()=>{if(this.roundId===myRound)this.finishRoundAndNext();});
    }
  }

  pigFlyOff(pm) {
    if(!pm?.pig)return;
    const flash=this.add.circle(pm.pig.x,pm.pig.y,36,0xffffff,0.9);
    this.tweens.add({targets:flash,alpha:0,scale:2.8,duration:240,onComplete:()=>flash.destroy()});
    try{
      const p=this.add.particles(pm.pig.x,pm.pig.y,"spark",{
        speed:{min:110,max:450},angle:{min:0,max:360},
        scale:{start:1.2,end:0},lifespan:500,quantity:25
      });
      this.time.delayedCall(520,()=>{try{p.destroy();}catch(e){}});
    }catch(e){}
    const dir=Phaser.Math.Between(0,1)?320:-320;
    this.tweens.add({
      targets:pm.pig,x:pm.pig.x+dir,y:-120,angle:720,scaleX:0.04,scaleY:0.04,
      duration:650,ease:"Back.easeIn",onComplete:()=>{try{pm.pig.destroy();}catch(e){}}
    });
    [pm.bubble,pm.label].forEach(o=>{
      if(!o)return;
      this.tweens.add({targets:o,alpha:0,duration:200});
    });
  }

  birdBounceBack() {
    if(!this.bird?.body)return;
    const vx=this.bird.body.velocity.x,vy=this.bird.body.velocity.y;
    this.bird.body.setVelocity(-Math.abs(vx)*2.5,Math.min(-60,vy*0.3-80));
    this.tweens.add({targets:this.bird,angle:720,duration:450,repeat:1,ease:"Linear"});
    this.time.delayedCall(500,()=>{
      const ouch=this.add.text(this.anchor.x+25,this.anchor.y-60,"OUCH! 😵",{
        fontSize:"28px",fontStyle:"bold",color:"#dc2626",stroke:"#ffffff",strokeThickness:5
      }).setOrigin(0.5).setDepth(15);
      this.tweens.add({targets:ouch,y:ouch.y-50,alpha:0,duration:950,ease:"Cubic.easeOut",onComplete:()=>ouch.destroy()});
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
    this.tweens.add({targets:this.banner,alpha:0,y:118,duration:780,delay:560,onComplete:()=>{this.banner.y=155;}});
  }

  updateStreakDisplay() {
    if(this.streak>=8)this.streakText.setText("🔥🔥 ×"+this.streak).setColor("#a855f7");
    else if(this.streak>=5)this.streakText.setText("🔥 ×"+this.streak).setColor("#ef4444");
    else if(this.streak>=2)this.streakText.setText("⚡ ×"+this.streak).setColor("#f59e0b");
    else this.streakText.setText("");
  }

  finishRoundAndNext() { this.bandGfx.clear(); this.trajGfx.clear(); this.newRound(); }

  newRound() {
    if(GAME_WORDS.length>0&&MASTERED.size>=GAME_WORDS.length&&REVENGE_POOL.length===0){
      this.time.delayedCall(600,()=>this.endSession()); return;
    }
    this.roundId++; this.roundFinished=false; this.launched=false;
    this.dragging=false; this.skillUsed=false; this.studyPreviewing=false;
    this.stopTimer();
    this.blocks.clear(true,true);
    this.pigMeta.forEach(p=>{p.pig?.destroy();p.label?.destroy();p.bubble?.destroy();p.moveTween?.stop();});
    this.pigMeta=[];
    this.birdIndex=(this.birdIndex+1)%this.birdCycle.length;
    this.birdType=this.birdCycle[this.birdIndex];
    const COLOR_NAMES={RED:"🔴 红鸟",BLUE:"🔵 蓝鸟",BLACK:"⚫ 黑鸟",GREEN:"🟢 绿鸟",YELLOW:"🟡 黄鸟",ORANGE:"🟠 橙鸟",PURPLE:"🟣 紫鸟",PINK:"🩷 粉鸟",CYAN:"🩵 青鸟",TEAL:"💚 碧鸟"};
    this.birdLabel.setText(COLOR_NAMES[this.birdType]||this.birdType);
    this.levelQ++;
    if(this.levelQ>5){this.levelQ=1;this.level++;this.showBanner("🎉 LEVEL "+this.level+"!","#fbbf24");}
    const imCount=REVENGE_POOL.filter(r=>r.immediate>0).length;
    const spCount=REVENGE_POOL.filter(r=>r.immediate===0).length;
    let ri="";
    if(imCount>0)ri="  ⚡立即复习:"+imCount+"词";
    else if(spCount>0)ri="  🔁待复习:"+spCount+"词";
    const remaining=GAME_WORDS.filter(w=>!MASTERED.has(w.word)).length;
    this.levelText.setText("第"+this.level+"关  Q"+this.levelQ+"/5  剩余:"+remaining+"词"+ri);
    this.tipText.setText("拖鸟→发射，击中正确答案的猪！");
    this.masteredText.setText(MASTERED.size>0?"✅ 已掌握 "+MASTERED.size+"/"+GAME_WORDS.length+" 词":"");
    this.spawnLevelBlocks();
    this.q=makeQuestion();
    speakWord(this.q.correct.word);
    if(this.studyMode){
      this.studyPreviewing=true;
      this.wordText.setText("📖 "+this.q.correct.word+"  →  "+this.q.correct.meaning);
      this.tipText.setText("📚 学习预览 2秒后开始...");
      this.resetBird();
      this.time.delayedCall(2000,()=>{
        if(!this.studyPreviewing)return;
        this.studyPreviewing=false;
        this.wordText.setText("WORD: "+this.q.correct.word);
        this.tipText.setText("拖鸟→发射，击中正确答案的猪！");
        this.spawnPigs(); this.startTimer();
      });
    } else {
      this.wordText.setText("WORD: "+this.q.correct.word);
      this.spawnPigs(); this.resetBird(); this.startTimer();
    }
  }
}


// ══════════════════════════════════════════════════════════
//  APP INIT — Wire up all screens
// ══════════════════════════════════════════════════════════
let gameInstance = null;

function startGame() {
  initGamePool();
  Session.start();
  Screens.showGame();
  const config = {
    type: Phaser.AUTO,
    width: W, height: H,
    parent: "wrap",
    backgroundColor: "#87ceeb",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
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
  BookUI.updateBookCards();
  Screens.show("bookScreen");
});

document.getElementById("usernameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

// Book selection
document.getElementById("bookGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".book-card");
  if (!card) return;
  const bookKey = card.dataset.book;
  if (!bookKey || !WORD_BOOKS[bookKey]) return;
  setCurrentBook(bookKey);
  DictUI.init();
  DictUI.onBookChange();
  Screens.show("dictScreen");
});

// Back to books from dictionary
document.getElementById("backToBooks").addEventListener("click", () => {
  BookUI.updateBookCards();
  Screens.show("bookScreen");
});

// Start game
document.getElementById("startGameBtn").addEventListener("click", () => {
  const selected = UserManager.getSelectedWords();
  if (selected.length < 3) { alert("请至少选择 3 个词！"); return; }
  startGame();
});

// Results → back to dict
document.getElementById("rBackDict").addEventListener("click", () => {
  DictUI.render();
  Screens.show("dictScreen");
});

// Results → play again
document.getElementById("rPlayAgain").addEventListener("click", () => {
  startGame();
});

// Stats button
document.getElementById("statsBtn").addEventListener("click", () => {
  StatsUI.render();
  Screens.show("statsScreen");
});

document.getElementById("statsBackBtn").addEventListener("click", () => {
  BookUI.updateBookCards();
  Screens.show("bookScreen");
});

// Notebook button
document.getElementById("notebookBtn").addEventListener("click", () => {
  NotebookUI.render();
  Screens.show("notebookScreen");
});

document.getElementById("notebookBackBtn").addEventListener("click", () => {
  BookUI.updateBookCards();
  Screens.show("bookScreen");
});

// Notebook filters
document.getElementById("nbFilters").addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-sm");
  if (!btn) return;
  document.querySelectorAll("#nbFilters .btn-sm").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  NotebookUI.filter = btn.dataset.nbf;
  NotebookUI.render();
});

// Logout (from book screen)
document.getElementById("logoutBtn2").addEventListener("click", () => {
  UserManager.logout();
  Screens.show("loginScreen");
  document.getElementById("usernameInput").value = "";
});

// Show login by default
Screens.show("loginScreen");
