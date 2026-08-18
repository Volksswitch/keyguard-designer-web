#!/usr/bin/env node
// build-migration-plan.mjs — generates KEYGUARD-MIGRATION-PLAN.docx in the repo root.
//
// THE DOCUMENT IS AN OUTPUT. Never hand-edit the .docx — edit this file (or
// scripts/migration-plan-mockups.mjs for the pictures) and rebuild, or the next
// rebuild silently discards the change. Same rule as the Bliss test plan, and for
// the same reason: the plan needs real version history, which it only has while
// its source is the thing under git.
//
//   node scripts/build-migration-plan.mjs                 -> ./KEYGUARD-MIGRATION-PLAN.docx
//   node scripts/build-migration-plan.mjs some/path.docx
//
// Needs the `docx` npm package, installed GLOBALLY on this machine and not
// resolvable from here by default. ⚠ Setting process.env.NODE_PATH at runtime
// does NOT work — Node reads it once at process start — so the global folder is
// resolved explicitly below, while still preferring a local install if one appears.
//
// The eight screenshots are rendered from real HTML by headless Chrome at 2x, so
// the wording in the pictures IS the wording in the plan: there is one copy of
// each notice and it lives in migration-plan-mockups.mjs.

import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MOCKUPS, pageHtml } from './migration-plan-mockups.mjs';

const require = createRequire(import.meta.url);
function loadDocx(){
  try { return require('docx'); } catch {}
  const globalAnchor = join(process.env.APPDATA || '', 'npm', 'node_modules', 'anchor.js');
  try { return createRequire(globalAnchor)('docx'); } catch {}
  console.error('\n  \u2717 The docx package is not installed.  Run: npm install -g docx\n');
  process.exit(1);
}
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ImageRun,
  Header, Footer, PageNumber,
} = loadDocx();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = process.argv[2] || join(ROOT, 'KEYGUARD-MIGRATION-PLAN.docx');

// ── rendering the pictures ────────────────────────────────────────────────────
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!CHROME){ console.error('\n  \u2717 No Chrome or Edge found to render the screenshots.\n'); process.exit(1); }

// WARNING Chrome's --screenshot captures the WINDOW, not the page: a window shorter
// than the content silently CROPS it, and the crop looks plausible enough to ship.
// (The "we have moved" panel lost its last two lines exactly that way.) So every
// shot is rendered with generous slack and then trimmed back to its own edges,
// which makes the declared height a floor rather than a guess that has to be right.
const SLACK = 260;
const MAGICK = ['C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe', 'magick']
  .find(p => p === 'magick' || existsSync(p));

const work = mkdtempSync(join(tmpdir(), 'kgplan-'));
const shots = {};
for (const m of MOCKUPS){
  const html = join(work, m.id + '.html');
  const png  = join(work, m.id + '.png');
  writeFileSync(html, pageHtml(m), 'utf8');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--screenshot=${png}`, `--window-size=${m.w},${m.h + SLACK}`,
    'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  if (!existsSync(png)){ console.error(`  x failed to render ${m.id}`); process.exit(1); }

  // Trim the surrounding white, then give it a hair of margin back.
  try {
    execFileSync(MAGICK, [png, '-bordercolor', 'white', '-border', '1',
                          '-fuzz', '1%', '-trim', '+repage',
                          '-bordercolor', 'white', '-border', '12', png], { stdio:'ignore' });
  } catch { /* untrimmed is still correct, just looser */ }

  const dim = execFileSync(MAGICK, ['identify', '-format', '%w %h', png]).toString().split(' ');
  const pxW = Number(dim[0]) / 2, pxH = Number(dim[1]) / 2;      // rendered at 2x
  shots[m.id] = { data: readFileSync(png), w: pxW, h: pxH };
  process.stdout.write(`  rendered ${m.id}  ${pxW} x ${pxH}\n`);
}

// ── document furniture ────────────────────────────────────────────────────────
const W = 9360;                                   // Letter minus 1" margins
const INK='1B2220', MUTE='5F6D68', TEAL='1A6459', OCHRE='7A4E12';
const HDR='DDE5E2', ALT='F4F7F6', WARN='FCF3DF', OK='E6F2EA', NEW='E4F2EE', OLD='F7EEDA';

const P = (text, o={}) => new Paragraph({
  spacing:{ after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 },
  alignment: o.align,
  indent: o.indent,
  children: (Array.isArray(text) ? text : [text]).map(t =>
    typeof t === 'string'
      ? new TextRun({ text:t, size:o.size ?? 21, color:o.color ?? INK, bold:o.bold, italics:o.italics,
                      font:o.font ?? 'Calibri' })
      : t),
});
const R  = (text, o={}) => new TextRun({ text, size:o.size ?? 21, color:o.color ?? INK,
                                         bold:o.bold, italics:o.italics, font:o.font ?? 'Calibri' });
const MONO = text => new TextRun({ text, size:19, font:'Consolas', color:INK });

const H1 = text => new Paragraph({ heading:HeadingLevel.HEADING_1, spacing:{before:360, after:160},
  children:[new TextRun({ text, size:32, bold:true, color:INK, font:'Calibri' })] });
const H2 = text => new Paragraph({ heading:HeadingLevel.HEADING_2, spacing:{before:280, after:120},
  children:[new TextRun({ text, size:25, bold:true, color:INK, font:'Calibri' })] });
const H3 = text => new Paragraph({ heading:HeadingLevel.HEADING_3, spacing:{before:220, after:90},
  children:[new TextRun({ text, size:22, bold:true, color:TEAL, font:'Calibri' })] });
const EYEBROW = text => new Paragraph({ spacing:{before:280, after:60},
  children:[new TextRun({ text:text.toUpperCase(), size:16, bold:true, color:MUTE,
                          font:'Calibri', characterSpacing:30 })] });

const bullet = (text, o={}) => new Paragraph({
  bullet:{ level: o.level ?? 0 }, spacing:{ after:80, line:264 },
  children:(Array.isArray(text)?text:[text]).map(t =>
    typeof t === 'string' ? R(t, o) : t),
});

function cell(children, width, o={}){
  return new TableCell({
    width:{ size:width, type:WidthType.DXA },
    shading: o.fill ? { type:ShadingType.CLEAR, color:'auto', fill:o.fill } : undefined,
    margins:{ top:90, bottom:90, left:130, right:130 },
    children: (Array.isArray(children)?children:[children]),
  });
}
function table(widths, rows, o={}){
  return new Table({
    width:{ size:W, type:WidthType.DXA },
    columnWidths: widths,
    borders: {
      top:   { style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
      bottom:{ style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
      left:  { style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
      right: { style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
      insideHorizontal:{ style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
      insideVertical:  { style:BorderStyle.SINGLE, size:2, color:'C9D4D0' },
    },
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0 && o.head !== false,
      children: r.map((c, j) => cell(
        (Array.isArray(c) ? c : [P(c, { after:0, size:19, bold: i===0 && o.head!==false,
                                        color: i===0 && o.head!==false ? MUTE : INK })]),
        widths[j],
        { fill: i===0 && o.head!==false ? HDR : (i % 2 === 0 ? ALT : undefined) })),
    })),
  });
}

// A picture plus its caption, kept together.
function figure(id, caption, tag){
  const s = shots[id];
  const wPx = Math.round(Math.min(s.w, 620));     // fit the text column
  const hPx = Math.round(s.h * (wPx / s.w));
  const out = [
    new Paragraph({
      spacing:{ before:200, after:60 }, alignment:AlignmentType.CENTER, keepNext:true,
      children:[ new ImageRun({ type:'png', data:s.data, transformation:{ width:wPx, height:hPx } }) ],
    }),
  ];
  const capKids = [];
  if (tag) capKids.push(new TextRun({ text:tag.toUpperCase()+'   ', size:15, bold:true,
                                      color: tag.toLowerCase().includes('new') ? TEAL : OCHRE,
                                      font:'Calibri', characterSpacing:20 }));
  capKids.push(...caption.map((t,i) => typeof t==='string'
    ? new TextRun({ text:t, size:18, color:MUTE, font:'Calibri' })
    : t));
  out.push(new Paragraph({ spacing:{ after:220 }, alignment:AlignmentType.CENTER,
    indent:{ left:600, right:600 }, children:capKids }));
  return out;
}
const capB = text => new TextRun({ text, size:18, bold:true, color:INK, font:'Calibri' });


// ── the document ──────────────────────────────────────────────────────────────
const doc = new Document({
  creator:'Volksswitch', title:'Keyguard Designer — migration plan',
  description:'Moving the Keyguard Designer to keyguard.volksswitch.org',
  styles:{ default:{ document:{ run:{ font:'Calibri', size:21, color:INK } } } },
  sections:[{
    properties:{ page:{ margin:{ top:1080, bottom:1080, left:1080, right:1080 } } },
    headers:{ default: new Header({ children:[ new Paragraph({
      alignment:AlignmentType.RIGHT, spacing:{after:0},
      children:[new TextRun({ text:'Keyguard Designer — migration plan', size:16, color:MUTE })] }) ] }) },
    footers:{ default: new Footer({ children:[ new Paragraph({
      alignment:AlignmentType.RIGHT, spacing:{before:0},
      children:[ new TextRun({ children:[PageNumber.CURRENT], size:16, color:MUTE }) ] }) ] }) },
    children:[

  // ── title block ──
  new Paragraph({ spacing:{ after:80 }, children:[
    new TextRun({ text:'MIGRATION PLAN · AGREED 18 AUGUST 2026',
                  size:16, bold:true, color:MUTE, characterSpacing:30 })]}),
  new Paragraph({ spacing:{ after:140 }, children:[
    new TextRun({ text:'Moving the Keyguard Designer to its own address', size:44, bold:true, color:INK })]}),
  P('Release 21 goes out to the address everyone uses today, carrying a request to save a copy of ' +
    'their settings and the machinery to move them. The new address is stood up alongside. When the ' +
    'move is armed, each clinician crosses on their own next visit, one at a time.',
    { size:23, color:'38443F', after:200 }),

  table([2600, 6760], [
    [[P([R('TODAY  ', {size:16, bold:true, color:OCHRE}),
        MONO('volksswitch.github.io/keyguard-designer-web')], {after:0})],
     [P('Shared with every other Volksswitch app ever published there. Blocked by some school networks.',
        {after:0, size:19})]],
    [[P([R('NEW  ', {size:16, bold:true, color:TEAL}),
        MONO('keyguard.volksswitch.org')], {after:0})],
     [P('An address of its own. Starts at release 100, so the release number alone says which address ' +
        'a clinician is on.', {after:0, size:19})]],
  ], { head:false }),

  // ── section 1 ──
  EYEBROW('The shape of it'),
  H1('Seven steps'),
  P('Two things travel separately, and keeping them separate is what makes this safe. Standing the new ' +
    'address up solves the urgent problem — clinicians whose schools block the current address ' +
    'cannot open the app at all, and they have nothing to lose by starting fresh somewhere new. Moving ' +
    'existing users is a different job with its own clock, and it can take as long as it needs to.'),

  table([560, 8800], [
    ['1', [P([R('Release 21 goes public on the old address.', {bold:true})], {after:60}),
      P('It can save a copy of the settings, it asks people to, and it carries all the logic for the ' +
        'move — dormant until armed. Saving is offered in the notice and nowhere else, so the ' +
        'consequence is always stated alongside the action.', {after:0, size:19})]],
    ['2', [P([R('The new address is stood up, and the website points at it.', {bold:true})], {after:60}),
      P('A separate site at keyguard.volksswitch.org, release 100. Blocked clinicians are unblocked the ' +
        'day this lands. Everyone else notices nothing — their bookmarks and icons still work ' +
        'exactly as before.', {after:0, size:19})]],
    ['3', [P([R('The move is armed.', {bold:true})], {after:60}),
      P('A single flag at the new address, set with no release involved and reversible at any moment. ' +
        'From then on each client crosses the next time it opens. There is no rush to do this — ' +
        'every week it waits, more people have already saved a copy.', {after:0, size:19})]],
    ['4', [P([R('People still on an older release update themselves to 21 first,', {bold:true}),
              R(' then are asked to save, then move.')], {after:60}),
      P('That first update runs on the machinery already installed on their machine, which has the two ' +
        'faults measured in last year’s rehearsal. Some will need a second visit to pick up ' +
        'release 21. It resolves itself; it is not a stranding.', {after:0, size:19})]],
    ['5', [P([R('People on release 21 cross as they save.', {bold:true})], {after:60}),
      P('Already saved before arming — they are moved on their next visit, silently, and the ' +
        'arrival screen does the explaining. Not yet saved — they are asked, and “Not ' +
        'now” leaves them where they are until next time.', {after:0, size:19})]],
    ['6', [P([R('The old address is frozen to features.', {bold:true})], {after:60}),
      P('Move-supporting patches only. Not bug fixes, not new design functionality. Anyone asking for ' +
        'either is told to save their settings and move. Everything else ships to the new address.',
        {after:0, size:19})]],
    ['7', [P([R('After about a school year, the old address becomes a “We’ve moved” page.',
              {bold:true})], {after:60}),
      P('It still carries settings across on a click, and it clears out the stale copy sitting on ' +
        'people’s machines — the one thing release 21 cannot do for them. It runs about a ' +
        'year, then goes.', {after:0, size:19})]],
  ], { head:false }),

  table([9360], [[[
    P([R('Why a school year before step 7. ', {bold:true}),
       R('Use is episodic — a clinician may not open the designer between March and September, ' +
         'and that is normal rather than an edge case. A full year means every seasonal user passes ' +
         'through the save-then-move flow at least once. Leaving release 21 up costs nothing, because ' +
         'it is frozen; there is nothing to maintain.')], {after:80}),
    P([R('And there is no way to measure this. ', {bold:true}),
       R('Nothing reports how many people are still on the old address. Every date here is a judgement ' +
         'rather than a measurement, which is an argument for erring long — erring short costs ' +
         'somebody their setup.')], {after:0}),
  ]]], { head:false }),

  // ── section 2 ──
  EYEBROW('What a clinician sees'),
  H1('Every notice, start to finish'),
  P([R('These are written to tell people what to do, not to explain why (Ken, 18 Aug 2026). ', {bold:true}),
     R('This audience has neither the time nor the interest for the reasoning, and an explanation is ' +
       'what makes them stop reading before the instruction. The reasons live in the release notes and ' +
       'on the website.')]),

  H2('On the old address'),

  ...figure('nag-before-arming', [
    capB('Before the move is armed. '),
    'Appears on every visit until they actually press Save, so the only people who keep seeing it are ' +
    'the ones not yet protected. “Not now” dismisses it for that visit alone.',
  ], 'Old address'),

  ...figure('nag-armed', [
    capB('Once the move is armed. '),
    'Same notice, and the button now says what it does. Saving is the gate: press it and you cross. ' +
    'That is why “Save my settings” becomes “Save and move me” rather than staying ' +
    'the same and quietly meaning something new.',
  ], 'Old address'),

  ...figure('saved-not-yet-armed', [
    capB('Saved, before the move is armed. '),
    'The only case where saving is not immediately followed by a move. The file goes into their project ' +
    'folder — see the note below on why that matters.',
  ], 'Old address'),

  table([9360], [[[
    P([R('⚠ Saving is the gate, and it has to be built that way. ', {bold:true}),
       R('An armed move carries across only those who have already saved a copy. Anyone who has not is ' +
         'asked first, and “Not now” genuinely means nothing happens — which is what the ' +
         'notice promises them. Built without that gate the move runs on every load once armed and takes ' +
         'people who have just declined; that is exactly what the first implementation did, and it was ' +
         'caught on the rig rather than by reading the code.')], {after:0}),
  ]]], { head:false }),

  table([9360], [[[
    P([R('Someone who has already saved, once the move is armed, sees nothing at all. ', {bold:true}),
       R('They are simply moved. Asking them to save a second time would be asking for something they ' +
         'have already done, and a departure notice on top of the arrival screen announces one event ' +
         'twice. Their saved copy being a few days stale does not matter, because the move carries ' +
         'their current settings; the file is only ever the fallback.')], {after:0}),
  ]]], { head:false }),

  H2('On the new address'),

  ...figure('arrival-settings-came', [
    capB('The normal arrival. '),
    'Permission to read a folder cannot move between web addresses, so reopening the project is ' +
    'unavoidable — and it is deliberately the only thing on this screen. Nothing about bookmarks ' +
    'or icons appears here; that comes next, and separately.',
  ], 'New address'),

  ...figure('arrival-settings-lost', [
    capB('When the settings did not come across. '),
    'Happens to someone who typed the new address instead of being moved, or cleared their browser, or ' +
    'is on a second machine. They are not asked to hunt for anything — opening the project is the ' +
    'same action as before, and the app takes it from there.',
  ], 'New address'),

  ...figure('settings-restored', [
    capB('And then this, by itself. '),
    'Because the saved copy is in the project folder they have just opened, the app can find it without ' +
    'anyone pointing at it. If it is not there — a different folder, a machine that never had one ' +
    '— the screen offers a file picker instead, which is the only remaining route.',
  ], 'New address'),

  table([9360], [[[
    P([R('Why the file goes in the project folder rather than the downloads folder. ', {bold:true}),
       R('An app cannot read a file off the disk unless a person points at it in a dialog — and ' +
         'saving does not tell it where the file went, because the browser chooses that and never says. ' +
         'So a copy in Downloads can never be found again by the app itself.')], {after:80}),
    P([R('There is exactly one folder we can be sure of on the other side: their project folder, which ' +
         'the arrival screen already asks them to open. Put the file there and the restore happens by ' +
         'itself. '),
       R('95% of keyguard users have only one project folder', {bold:true}),
       R(', so for almost everyone the folder they reopen is the folder the file is in.')], {after:80}),
    P([R('The request only appears once a project is open, ', {bold:true}),
       R('so saving is a single click into a folder the app already holds. Asking someone to pick a ' +
         'project purely so a file could be written was worse than it sounds: with the move armed they ' +
         'would then be carried across seconds later, and the first thing the new address does is ask ' +
         'them to open that same project again — the same folder picked twice, the app loading ' +
         'twice, inside about ten seconds (Ken, 18 Aug 2026). Reopening after a move is unavoidable; ' +
         'making someone open a project first was not.')], {after:80}),
    P([R('Consequence, accepted: ', {bold:true}),
       R('someone who never opens a project is never asked, and never moved. The “We’ve ' +
         'moved” page in step 7 is the backstop for them.')], {after:0}),
  ]]], { head:false }),

  ...figure('cleanup-bar', [
    capB('And then the one remaining job, as a standing notice. '),
    'Updating a bookmark and replacing an installed icon are important but not urgent, and instructions ' +
    'like that always lose to the button someone came to press. So this is the same bar as the save ' +
    'request on the old address: it sits behind the launch gate, they meet it once they are in the app, ' +
    'and it returns on every visit until they press it. One pattern, learned once, used twice.',
  ], 'New address'),

  table([9360], [[[
    P([R('Why this is not a link on the arrival screen. ', {bold:true}),
       R('It was, in the first draft — a text link beside the dark “Open a project” button. ' +
         'People press the dark button in the corner and register nothing else on the screen, so the ' +
         'one instruction that has a deadline attached would have been the one nobody read ' +
         '(Ken, 18 Aug 2026).')], {after:80}),
    P([R('Pressing “Show me how” ends it, exactly as pressing Save ends the other one. ', {bold:true}),
       R('There is no way to verify that someone actually replaced their icon, and no attempt is made ' +
         'to detect it — which is also why the app never needs to know whether it is running in ' +
         'an installed window or a browser tab. The linked page covers both cases in two short ' +
         'sections.')], {after:0}),
  ]]], { head:false }),

  H2('A year later, on the old address'),

  ...figure('we-have-moved', [
    capB('The signpost. '),
    'It carries settings across on the click, exactly as release 21 did — proven during the Bliss ' +
    'move. Anyone who navigates around it and types the new address instead arrives with nothing, which ' +
    'is why the one line under the button is there.',
  ], 'Old address'),

  H2('The icon'),

  ...figure('icons-old-new', [
    capB('Black means the app is served from its own volksswitch.org address. '),
    'During the overlap a clinician can have both icons, identically named, and this is the only way to ' +
    'tell them apart. Keyguard ships one icon file today; it needs the full set, including the version ' +
    'Android is allowed to crop.',
  ], null),

  // ── section 3 ──
  EYEBROW('Read out of the app · six items'),
  H1('What has to change in release 21'),
  P('Each of these was found reading the app. The first two are the ones that would have gone wrong ' +
    'quietly.'),

  table([420, 4500, 4440], [
    ['#', 'What is there now', 'What follows from it'],
    ['01',
     [P([R('All of keyguard’s settings are one item, not many.', {bold:true})], {after:60}),
      P('Bliss stored each setting separately, so its rule for what to carry across was a name pattern ' +
        '— which is what swept up another app’s API key. Keyguard keeps all 22 of its ' +
        'settings in a single item.', {after:0, size:19})],
     [P([R('Good news, and it retires the security condition. ', {bold:true}),
         R('The rule becomes “carry this one item, by name” — a list of one. Nothing ' +
           'else at the shared address can be swept up even by accident.')], {after:0, size:19})]],
    ['02',
     [P([R('… and the record of which updates you have read is buried inside it.', {bold:true})], {after:60}),
      P('That record must never cross between the two addresses, because they count releases ' +
        'differently. At Bliss it was a separate item, easy to leave behind. Here it is a field inside ' +
        'the settings.', {after:0, size:19})],
     [P([R('Copy the Bliss rule literally and it misses. ', {bold:true}),
         R('The field is stripped out as the settings travel — which is also why nobody arriving ' +
           'gets a hundred releases of notes on top of the arrival screen.')], {after:0, size:19})]],
    ['03',
     [P([R('The app still tells people to hard-refresh.', {bold:true})], {after:60}),
      P('When an update will not take, it advises Ctrl+Shift+R. During the move that is the one action ' +
        'that destroys a clinician’s settings.', {after:0, size:19})],
     [P([R('Replaced by a “Reload the app” button on the About tab. ', {bold:true}),
         R('It checks for a pending move first and carries the settings before clearing anything. It ' +
           'also doubles as the way back for someone who pressed “Not now” and changed their ' +
           'mind.')], {after:0, size:19})]],
    ['04',
     [P([R('Updates arrive from GitHub — the thing blocked schools cannot reach.', {bold:true})], {after:60}),
      P('Both the app’s update check and its designer-file check fetch from GitHub directly, so a ' +
        'clinician on a blocking network cannot receive updates at all.', {after:0, size:19})],
     [P([R('Move both onto the app’s own address. ', {bold:true}),
         R('Release 100 inherits it, which is what makes updates reach a blocked school once the app ' +
           'itself does.')], {after:0, size:19})]],
    ['05',
     [P([R('The short form of the address is not saved for offline use.', {bold:true})], {after:60}),
      P('A bookmark to the full address keeps working offline. One to the folder above it does not.',
        {after:0, size:19})],
     [P([R('A one-line fix. ', {bold:true}),
         R('Small, because the link published on the website is already the safe form. Free, so do it.')],
        {after:0, size:19})]],
    ['06',
     [P([R('Two update faults from last year’s rehearsal are still present.', {bold:true})], {after:60}),
      P('A fresh offline copy can be filled with the old version’s files, and the ' +
        '“don’t retry forever” guard can give up on an update that would have worked.',
        {after:0, size:19})],
     [P([R('Fix both. ', {bold:true}),
         R('They cannot help the first hop — that runs on machinery already on the clinician’s ' +
           'machine — but they make every hop afterwards reliable.')], {after:0, size:19})]],
  ]),

  // ── section 4 ──
  EYEBROW('What the Bliss postmortem changes'),
  H1('Seven rules carried into this plan'),
  P('The Bliss migration worked, but three of its most serious findings were invisible to the tests ' +
    'meant to catch them. The common thread was that something was assumed rather than looked at.'),

  table([2900, 3230, 3230], [
    ['Rule', 'Because', 'What it looks like here'],
    ['Read the payload out loud before the first real user sees it',
     'The Bliss move put an API key and a person’s contact details into a web address. The code did ' +
     'exactly what the specification said; nobody ever listed what that specification actually caught.',
     'Before arming, print the exact list of what will travel and check it by eye. Here it should be one ' +
     'item long.'],
    ['Re-read each test client just before you use it, not when you set it up',
     'A whole session went into diagnosing a settings fault that did not exist — Edge was deleting ' +
     'the setting on close, hours before the test ran. Two irreplaceable test clients were spent on it.',
     'Every step records what it reads from the client at that moment, not what was put there earlier.'],
    ['Check each machine’s browser settings before spending a one-shot client',
     'Same finding. The Edge setting was findable in advance and nobody looked.',
     'A short conformance pass per machine and browser, written down, before the move is armed.'],
    ['The setting used as the marker must not change what you can observe',
     'Bliss carried the “show me update notices” setting as its marker — the very setting ' +
     'that suppresses the notice four other checks were watching for. They passed while being incapable ' +
     'of failing.',
     'Use the viewport background colour: visible at a glance, affects nothing else.'],
    ['No “nothing should happen” check without a client where something does',
     'Two checks were written to catch specific faults and neither could detect anything at all.',
     'Every negative check names the client that acts as its control.'],
    ['The release guard must know the retirement state',
     'The guard identifies an address by the app files present, and retirement removes them — so it ' +
     'refused the go-live push at the point of no return, and did it again when the last migration file ' +
     'was deleted.',
     'Teach it all three states from the start: live, frozen, retired.'],
    ['The two release phrases must not start with the same words',
     '“bump old bts web app” contains “bump bts web app”. A guard script was written ' +
     'to compensate for a naming choice that could simply have been made differently.',
     'To be chosen when the second repository is created — the phrase for the frozen address must ' +
     'diverge on its FIRST word.'],
  ]),

  table([9360], [[[
    P([R('Release 21 is very nearly unfixable, so it is rehearsed before it ships. ', {bold:true}),
       R('Once it is out, the old address is frozen and only move-supporting patches are allowed. The ' +
         'Bliss sandbox rig is the only thing that can exercise the whole chain — an old client ' +
         'updating itself to 21, being asked to save, saving, moving, and landing — before any of ' +
         'it is irreversible. That is why the rig has not been tidied away.')], {after:0}),
  ]]], { head:false }),

  // ── section 5 ──
  EYEBROW('Still to decide'),
  H1('Three open items'),

  table([340, 9020], [
    ['1', [P([R('The repository name for the new site.', {bold:true})], {after:60}),
           P('Bliss used bts-web-app for its new home; the matching choice here is keyguard-web-app, ' +
             'leaving the existing one as the address being retired. Needed at step 2, not before.',
             {after:0})]],
    ['2', [P([R('The release phrase for the frozen address.', {bold:true})], {after:60}),
           P('Once two addresses exist there must be two phrases, and they must not begin with the same ' +
             'words. Needed when the second repository is created.', {after:0})]],
    ['3', [P([R('A review date for step 7.', {bold:true})], {after:60}),
           P('So the timing lives in this document rather than on a mental list that has to be reviewed. ' +
             'To be filled in once the move is armed.', {after:0})]],
  ], { head:false }),

  P(''),
  P([R('This document is generated. ', {bold:true, size:18, color:MUTE}),
     R('Edit scripts/build-migration-plan.mjs, or scripts/migration-plan-mockups.mjs for the wording in ' +
       'the pictures, and run "node scripts/build-migration-plan.mjs". Hand edits to the .docx ' +
       'are lost on the next rebuild.', {size:18, color:MUTE})], {before:200}),

    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  try {
    writeFileSync(OUT, buf);
  } catch (e) {
    rmSync(work, { recursive:true, force:true });
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      // Word holds an exclusive lock while the document is open, which it will be
      // most of the time this script is run — the person rebuilding the plan is
      // usually the person reading it.
      console.error(`
  The plan is open in Word, so it cannot be rewritten.
` +
                    `  Close it and run this again.
`);
      process.exit(1);
    }
    throw e;
  }
  console.log(`\n  OK wrote ${OUT}  (${(buf.length/1024).toFixed(0)} KB, ${MOCKUPS.length} screenshots)\n`);
});
