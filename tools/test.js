// 用 Node 跑一遍页面里的渲染逻辑：生成六套主题输出、做结构断言、界面层冒烟测试
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// 页面有两个 <script>：head 里那个只负责首帧配色，取最长的一段才是主逻辑
const js = html.match(/<script>([\s\S]*?)<\/script>/g)
  .map(s => s.replace(/^<script>/, '').replace(/<\/script>$/, ''))
  .sort((a, b) => b.length - a.length)[0];

/* ---------------- 极简 DOM stub ---------------- */
function mkEl(id){
  const el = {
    id: id || '', value: '', innerHTML: '', textContent: '', title: '',
    scrollTop: 0, scrollHeight: 2000, clientWidth: 1200, clientHeight: 800,
    parentElement: null, children: [],
    _ev: {},
    dataset: {},
    style: {
      _p: {},
      setProperty(k, v){ this._p[k] = v; },
      removeProperty(k){ delete this._p[k]; },
      getPropertyValue(k){ return this._p[k] || ''; }
    },
    classList: {
      _s: new Set(),
      toggle(c, v){
        if(v === undefined) v = !this._s.has(c);
        v ? this._s.add(c) : this._s.delete(c);
      },
      add(c){ this._s.add(c); },
      remove(c){ this._s.delete(c); },
      contains(c){ return this._s.has(c); }
    },
    appendChild(c){
      if(c.parentElement) c.parentElement.children = c.parentElement.children.filter(x => x !== c);
      c.parentElement = this;
      this.children.push(c);
      return c;
    },
    querySelectorAll(){ return []; },
    querySelector(){ return mkEl(''); },
    addEventListener(t, f){ this._ev[t] = f; },
    scrollTo(){ this.scrollTop = 0; },
    getBoundingClientRect(){ return { width: 400, height: 700, left: 0, top: 0 }; }
  };
  return el;
}

const els = {};
global.document = {
  documentElement: {
    _a: {},
    setAttribute(k, v){ this._a[k] = String(v); },
    getAttribute(k){ return k in this._a ? this._a[k] : null; }
  },
  getElementById: id => (els[id] = els[id] || mkEl(id)),
  createElement: () => mkEl(''),
  querySelectorAll: () => [],
  querySelector: () => mkEl(''),
  createRange: () => ({ selectNodeContents(){} }),
  execCommand: () => true,
  getSelection: () => ({ removeAllRanges(){}, addRange(){} })
};
global.window = { addEventListener(){}, innerWidth: 1500 };
global.requestAnimationFrame = f => f();
global.getComputedStyle = () => ({
  paddingLeft: '22px', paddingRight: '22px',
  paddingTop: '0px', paddingBottom: '0px'      // 手机模式下 stage 上下不留白
});
const __mem = {};
global.localStorage = {
  getItem: k => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v); },
  removeItem: k => { delete __mem[k]; }
};
global.navigator = {};
global.alert = () => {};
global.confirm = () => false;
global.ClipboardItem = function(){};
global.Blob = function(){};

// eval 里的 const 不会泄漏到外层，主动挂到 global
eval(js + `\n;Object.assign(global, {
  THEMES, build, parse, render, pick, load, loadDemo,
  elSrc, elOut, elScreen, elPcScreen, elStage, elMain,
  setLayout, applyLayout, setMode, applyMode, setSync, fit, setUi,
  DEMO, ending, endingIcons, countChars, articleTitle, WX_ID,
  fileStamp, CREDIT_URL,
  cur: () => cur,
  setCur: v => { cur = v; },
  ui: () => uiMode,
  view: () => ({ layout, vmode, syncOn, lw, uiMode })
});`);

const md = fs.readFileSync(path.join(__dirname, '..', 'examples', 'fixture.md'), 'utf8');
const outDir = path.join(__dirname, '..', 'out');
fs.mkdirSync(outDir, { recursive: true });

/* ---------------- 结构断言：每块只在 1 层内边距里 ----------------
   以前 chapter() 漏闭合，导致每章把后面所有块吞进去，padding 层层累加，
   正文越往下越窄（335 → 295 → 255 …）。静态统计开闭标签是配平的，
   只有按 DOM 祖先链统计才看得出来，所以这里扫标签栈。            */
function padDepthAudit(html){
  const re = /<section\b[^>]*>|<\/section>|<p\b[^>]*>/g;
  const stack = [];
  let m, max = 0, total = 0, wrong = [];
  while((m = re.exec(html))){
    const t = m[0];
    if(t.startsWith('</')) stack.pop();
    else if(t.startsWith('<p')){
      const n = stack.reduce((a, b) => a + b, 0);
      total++;
      if(n > max) max = n;
      if(n !== 1) wrong.push(n);
    } else {
      const st = (t.match(/style="([^"]*)"/) || [])[1] || '';
      stack.push(/padding:0\s/.test(st) ? 1 : 0);
    }
  }
  return { max, total, wrong };
}

console.log('=== 六套主题输出 ===');
let structFail = 0;
for (const key of Object.keys(THEMES)){
  const out = build(md, key);
  fs.writeFileSync(path.join(outDir, `theme-${key}.html`), out, 'utf8');
  const a = padDepthAudit(out);
  const okDepth = a.max === 1 && a.wrong.length === 0;
  if(!okDepth) structFail++;
  console.log(`  ${okDepth ? '✓' : '✗'} ${key.padEnd(9)} ${THEMES[key].label.padEnd(6)} ${String(out.length).padStart(6)} chars  padding层=${a.max}${a.wrong.length ? ' 异常:' + a.wrong.length + '处' : ''}`);
}
console.log(structFail ? `✗ 结构断言失败 ${structFail} 套（正文宽度会逐级收窄）` : '✓ 结构断言：全部主题每块都只有 1 层内边距');

/* ---------------- 结尾三连引导 ---------------- */
console.log('\n=== 结尾引导 ===');
const NEW_END = '都看到这里了，请随手点赞、转发、关注一下吧！';
let endFail = 0;
for (const key of Object.keys(THEMES)){
  const out = build(md, key);
  const okText = out.includes(NEW_END);
  const okIcons = ['点赞','转发','关注'].every(t => out.includes('>' + t + '<'));
  const okOld = !out.includes('欢迎点赞、在看、转发三连');
  if(!okText || !okIcons || !okOld) endFail++;
  console.log(`  ${okText && okIcons && okOld ? '✓' : '✗'} ${key.padEnd(9)} 文案=${okText?'新':'旧'} 图标=${okIcons?'3个':'-'} 残留旧文案=${okOld?'无':'有'}`);
}
console.log(endFail ? '✗ 结尾引导异常' : '✓ 六个主题都有新文案 + 点赞/转发/关注三图标');

/* ---------------- 示例文章覆盖度 ---------------- */
console.log('\n=== 示例覆盖 ===');
const DEMO_RULES = [
  ['一级标题', /^# .+/m], ['二级标题', /^## .+/m], ['三级标题', /^### .+/m],
  ['加粗', /\*\*[^*]+\*\*/], ['高亮', /==[^=]+==/],
  ['下划线', /\+\+[^+]+\+\+/], ['删除线', /~~[^~]+~~/],
  ['行内代码', /`[^`\n]+`/], ['引用', /^> .+/m],
  ['无序列表', /^- .+/m], ['有序列表', /^\d+\. .+/m],
  ['代码块', /```/], ['图片', /!\[[^\]]*\]\([^)]+\)/], ['分割线', /^---$/m]
];
const missDemo = DEMO_RULES.filter(([, re]) => !re.test(DEMO)).map(([n]) => n);
const demoTypes = new Set(parse(DEMO).map(b => b.t + (b.ordered === undefined ? '' : b.ordered ? ':ol' : ':ul')));
console.log(`  语法 ${DEMO_RULES.length - missDemo.length}/${DEMO_RULES.length}${missDemo.length ? ' 缺: ' + missDemo.join(',') : ''}`);
console.log(`  块类型 ${[...demoTypes].join(' ')}`);
console.log(!missDemo.length ? '✓ 示例覆盖全部语法' : '✗ 示例缺语法');

/* ---------------- 单栏布局：只剩一条轨道 ---------------- */
console.log('\n=== 单栏布局 ===');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const okGrid = /main\.only-right\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css)
            && /main\.only-left\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css);
console.log(okGrid
  ? '✓ only-left / only-right 都是单轨（右栏不会再被 0 宽轨道挤到最左）'
  : '✗ 单栏仍是 3 轨，右栏会被压成 0 宽');

/* ---------------- 字数统计 ---------------- */
console.log('\n=== 字数统计 ===');
const cc = countChars('你好，世界！hello world 42');
const okCount = cc.han === 4 && cc.en === 2 && cc.punc === 2 && cc.total === 8;
console.log(`  汉字 ${cc.han} · 英文 ${cc.en} · 标点 ${cc.punc} · 总计 ${cc.total}`);
console.log(okCount ? '✓ 汉字/英文词/标点分项正确' : '✗ 字数统计异常');

/* ---------------- 界面冒烟 ---------------- */
console.log('\n=== 界面冒烟 ===');
elSrc.value = md;
try{
  render();
  const h = elOut.innerHTML;
  const bad = [];
  if(/<div[\s>]/i.test(h)) bad.push('含 <div>');
  if(/\sclass\s*=/i.test(h)) bad.push('含 class');
  if(/\sid\s*=/i.test(h)) bad.push('含 id');
  if(/position\s*:\s*(fixed|absolute|sticky)/i.test(h)) bad.push('含 absolute');
  console.log('渲染输出', h.length, 'chars · leaf', (h.match(/span leaf=""/g) || []).length);
  console.log(bad.length ? '✗ 红线问题: ' + bad.join(', ') : '✓ 红线检查通过');
}catch(e){
  console.log('✗ 渲染报错:', e.message);
}

/* ---------------- 缓存往返 ---------------- */
console.log('\n=== 缓存 ===');
elSrc.value = md;
pick('zen');
setLayout('left');
setMode('pc');
setSync(false);
let d = null;
try{ d = JSON.parse(localStorage.getItem('gzh-paiban-v2')); }catch(e){}
console.log(d ? `写入 ${d.theme} / ${d.md.length} 字符 / ${d.layout} / ${d.vmode} / sync=${d.sync}` : '✗ 未写入');
const okWrite = d && d.theme === 'zen' && d.md === md && d.layout === 'left' && d.vmode === 'pc' && d.sync === false;

// 模拟重新打开：先备份盘上快照（页内 setter 会把空内容写回去，真实场景不会）
const snap = localStorage.getItem('gzh-paiban-v2');
elSrc.value = '';
setCur('green');
setLayout('both');
setMode('phone');
setSync(true);
localStorage.setItem('gzh-paiban-v2', snap);
load();
const v = view();
const okRead = elSrc.value === md && cur() === 'zen' && v.layout === 'left' && v.vmode === 'pc' && v.syncOn === false;
console.log(okWrite ? '✓ 写入' : '✗ 写入', okRead ? '✓ 恢复' : '✗ 恢复', `(${cur()} / ${v.layout} / ${v.vmode} / sync=${v.syncOn})`);

/* ---------------- 布局与模式 ---------------- */
console.log('\n=== 视图状态 ===');
setLayout('both');
const a1 = !elMain.classList.contains('only-left') && !elMain.classList.contains('only-right');
setLayout('left');
const a2 = elMain.classList.contains('only-left');
setLayout('right');
const a3 = elMain.classList.contains('only-right');
console.log(a1 && a2 && a3 ? '✓ 三档布局切换' : '✗ 布局切换异常');

setLayout('both');
setMode('phone');
const m1 = elOut.parentElement === elScreen;
setMode('pc');
const m2 = elOut.parentElement === elPcScreen && elMain.classList.contains('mode-pc');
setMode('phone');
const m3 = elOut.parentElement === elScreen;
console.log(m1 && m2 && m3 ? '✓ 手机/PC 切换（#out 在两种容器间搬移）' : '✗ 预览模式切换异常');

/* ---------------- 缩放与手机高度 ---------------- */
console.log('\n=== 自适应缩放 ===');
function zoomFor(w, h){
  elStage.clientWidth = w;
  elStage.clientHeight = h;
  fit();
  const cs = { pl: 22, pr: 22, pt: 0, pb: 0 };   // 与 getComputedStyle stub 一致
  const availH = h - cs.pt - cs.pb;
  return {
    phone: parseFloat(elStage.style.getPropertyValue('--zoom')),
    pc: parseFloat(elStage.style.getPropertyValue('--pczoom')),
    devh: parseFloat(elStage.style.getPropertyValue('--devh')),
    ratio: (parseFloat(elStage.style.getPropertyValue('--devh')) + 24) / availH
  };
}
const zWide = zoomFor(1000, 900);
const zNarrow = zoomFor(360, 900);
const zShort = zoomFor(1000, 500);
const okZoom =
  zWide.phone === 1 && zWide.pc === 1 &&                 // 宽高都够 → 不缩小
  Math.abs(zWide.ratio - 0.99) < 0.005 &&                // 整机（含边框）占可用高度 99%
  zNarrow.phone < 1 && zNarrow.pc < 1 &&                 // 拖窄 → 等比缩小
  zShort.devh < 720 && zShort.phone === 1;               // 矮窗 → 机身变矮，不再整体缩
console.log(`宽 高占比 ${(zWide.ratio*100).toFixed(1)}% zoom=${zWide.phone}/${zWide.pc} · 窄 ${zNarrow.phone.toFixed(2)}/${zNarrow.pc.toFixed(2)} · 矮 机身 ${zShort.devh.toFixed(0)}px zoom=${zShort.phone}`);
console.log(okZoom ? '✓ 手机高度吃满右栏 99%，拖窄才等比缩小' : '✗ 缩放/高度计算异常');

/* ---------------- 下载文件名 ---------------- */
console.log('\n=== 下载命名 ===');
const stamp = fileStamp(new Date(2026, 9, 23, 9, 5, 7));
const okStamp = /^\d{8}-\d{6}$/.test(stamp) && stamp === '20261023-090507';
console.log(`  公众号文章-${stamp}.html`);
console.log(okStamp ? '✓ 文件名 = 公众号文章 + 年月日-时分秒' : '✗ 时间戳格式异常');

/* ---------------- 风格菜单装饰与致谢 ---------------- */
console.log('\n=== 界面提示 ===');
const leadOk = /themes-lead/.test(html) && /调色盘|themes-lead/.test(html);
const creditOk = CREDIT_URL === 'https://github.com/isjiamu/gzh-design-skill' && html.includes(CREDIT_URL);
console.log(`  ${leadOk ? '✓' : '✗'} 风格菜单前的调色盘装饰`);
console.log(`  ${creditOk ? '✓' : '✗'} 帮助弹窗致谢 ${CREDIT_URL}`);

/* ---------------- 界面配色 ---------------- */
console.log('\n=== 界面配色 ===');
setUi('light');
const uLight = document.documentElement.getAttribute('data-ui') === 'light' && ui() === 'light';
const uSaved = (JSON.parse(localStorage.getItem('gzh-paiban-v2')) || {}).ui === 'light';
const uCss = /html\[data-ui="light"\]\s*\{/.test(html);
setUi('dark');
const uDark = document.documentElement.getAttribute('data-ui') === 'dark' && ui() === 'dark';
console.log(`  浅色 ${uLight ? '✓' : '✗'} · 写缓存 ${uSaved ? '✓' : '✗'} · 切回深色 ${uDark ? '✓' : '✗'} · 浅色变量块 ${uCss ? '✓' : '✗'}`);
console.log(uLight && uSaved && uDark && uCss ? '✓ 深色/浅色可切换且记住' : '✗ 界面配色异常');

/* ---------------- 许可合规：AGPL 衍生作品不能漏声明 ---------------- */
console.log('\n=== 许可合规 ===');
const root = path.join(__dirname, '..');
const licTxt = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
const noticeTxt = fs.readFileSync(path.join(root, 'NOTICE'), 'utf8');
const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
// LICENSE 只放未经改动的 AGPL 原文（便于 GitHub 识别），版权与衍生说明集中在 NOTICE
const okLic = /GNU AFFERO GENERAL PUBLIC LICENSE/.test(licTxt) && /Version 3, 19 November 2007/.test(licTxt);
const okNotice = /衍生作品/.test(noticeTxt) && /isjiamu\/gzh-design-skill/.test(noticeTxt)
              && /Jiamu/.test(noticeTxt) && /Simon Yang/.test(noticeTxt);
const okPkg = pkgJson.license === 'AGPL-3.0-or-later';
// §5 的「保留版权声明」也要落在源码里
const okPage = /项目源码/.test(html) && /AGPL-3\.0-or-later/.test(html) && /Jiamu/.test(html);
console.log(`  LICENSE ${okLic ? '✓' : '✗'} · NOTICE ${okNotice ? '✓' : '✗'} · package.json ${okPkg ? '✓' : '✗'} · 页面源码入口 ${okPage ? '✓' : '✗'}`);
console.log(okLic && okNotice && okPkg && okPage ? '✓ AGPL 声明齐全（含上游版权与源码入口）' : '✗ 许可声明不完整');

/* ---------------- 同步开关 ---------------- */
setSync(true);
const s1 = view().syncOn === true;
setSync(false);
const s2 = view().syncOn === false;
console.log(s1 && s2 ? '\n✓ 同步滚动开关' : '\n✗ 同步开关异常');

process.exitCode = (structFail || okWrite === false || okRead === false) ? 1 : 0;
