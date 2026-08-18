// migration-plan-mockups.mjs — the pictures that go in KEYGUARD-MIGRATION-PLAN.docx.
//
// Each entry is a self-contained little web page showing ONE notice exactly as a
// clinician will meet it. `build-migration-plan.mjs` renders them with headless
// Chrome and drops the resulting images into the document, so the wording in the
// plan and the wording in the pictures can never drift apart — they are the same
// text, written once, here.
//
// To change what a notice says, change it HERE and rebuild the plan.
//
// HOUSE RULE for this audience (Ken, 18 Aug 2026): tell a clinician what to DO.
// Do not explain the reasons. They have neither the time nor the interest, and an
// explanation is what makes them stop reading before the instruction.

// One fixed light appearance for every mock-up: these are pictures of the real
// app, so they must not follow anyone's dark mode.
const CSS = `
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#ffffff;}
  body{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;
       font-size:13px;line-height:1.5;color:#1d2321;}
  .screen{border:1px solid #c3cfcb;border-radius:9px;overflow:hidden;background:#fbfcfb;}
  .chrome{display:flex;align-items:center;gap:10px;padding:9px 12px;
          background:#f1f4f3;border-bottom:1px solid #d8dedb;}
  .dots{display:flex;gap:5px;flex:0 0 auto;}
  .dots i{width:9px;height:9px;border-radius:50%;background:#c8d0cd;display:block;}
  .urlbar{flex:1 1 auto;font-family:Consolas,"Cascadia Mono",monospace;font-size:11.5px;
          color:#6a7873;background:#fff;border:1px solid #d8dedb;border-radius:5px;
          padding:3px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .urlbar b{color:#2b3431;font-weight:600;}
  .chrome.appwin .urlbar{background:transparent;border:0;
          font-family:"Segoe UI",sans-serif;font-size:12px;}

  .app-top{display:flex;align-items:center;justify-content:space-between;
           padding:8px 12px;border-bottom:1px solid #d8dedb;background:#f1f4f3;}
  .app-title{font-weight:600;}
  .app-rel{font-family:Consolas,monospace;font-size:11px;color:#6a7873;}
  .app-body{display:flex;height:150px;}
  .app-view{flex:1 1 auto;background:#e9edec;display:grid;place-items:center;}
  .plate{width:120px;height:88px;background:#fff;border:1px solid #c8d0cd;border-radius:8px;
         display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);
         gap:7px;padding:9px;}
  .plate i{background:#dfe6e3;border-radius:3px;display:block;}
  .app-pane{width:138px;flex:0 0 auto;border-left:1px solid #d8dedb;background:#f7f9f8;padding:9px 10px;}
  .app-pane div{height:7px;background:#e2e8e5;border-radius:3px;margin-bottom:8px;}
  .app-pane div:nth-child(2){width:72%;}
  .app-pane div:nth-child(4){width:58%;}
  .app-pane div:nth-child(5){width:84%;}

  .notice{display:flex;align-items:center;gap:12px;padding:11px 13px;
          background:#fdf6e3;border-bottom:1px solid #e8dcc0;color:#5c4813;
          font-size:12.5px;line-height:1.45;}
  .notice .ntext{flex:1 1 auto;}
  .notice b{color:#4a3a0d;}
  .nbtns{display:flex;gap:6px;flex:0 0 auto;}
  .notice.done{background:#e8f4ec;border-bottom-color:#c6e0d0;color:#1f5133;}
  .notice.done b{color:#17402a;}

  .btn{font-family:inherit;font-size:12px;padding:4px 11px;border-radius:4px;
       border:1px solid #b9c2be;background:#fff;color:#1d2321;white-space:nowrap;}
  .btn.pri{background:#1f7a6c;border-color:#1a6459;color:#fff;font-weight:600;}
  .btn.ghost{background:transparent;border-color:#cbd3d0;color:#4c5a55;}
  .btn.link{border:0;background:transparent;color:#1f7a6c;font-weight:600;
            text-decoration:underline;padding:4px 0;}

  .modal-stage{background:#e9edec;padding:22px 16px;display:grid;place-items:center;}
  .modal{background:#fafafa;color:#2b3431;border:1px solid #99a5a1;border-radius:5px;
         width:430px;overflow:hidden;
         box-shadow:0 10px 30px -12px rgba(0,0,0,.45);}
  .modal h5{padding:10px 14px;font-size:13px;font-weight:600;color:#1d2321;
            border-bottom:1px solid #ccd4d1;background:#f0f3f2;}
  .mbody{padding:14px;font-size:12.5px;line-height:1.55;}
  .mbody p{margin-bottom:10px;}
  .mbody p:last-child{margin-bottom:0;}
  .mfoot{padding:9px 14px;border-top:1px solid #ccd4d1;background:#f0f3f2;
         display:flex;justify-content:flex-end;gap:7px;align-items:center;}
  .mfoot .spacer{flex:1 1 auto;}

  .moved{background:#fff;padding:38px 26px;text-align:center;}
  .mv-mark{width:52px;height:52px;margin:0 auto 18px;border-radius:11px;background:#000;
           display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:5px;padding:10px;}
  .mv-mark i{background:#fff;border-radius:2.5px;display:block;}
  .moved h5{font-size:20px;font-weight:600;margin-bottom:16px;}
  .moved .btn{font-size:13px;padding:7px 18px;}
  .moved p{font-size:12.5px;color:#6a7873;margin:16px auto 0;max-width:40ch;line-height:1.55;}

  .icons{display:flex;gap:44px;justify-content:center;align-items:flex-end;padding:20px 10px;}
  .iconcell{text-align:center;font-size:12.5px;color:#5f6d68;}
  .iconcell b{display:block;color:#2b3431;font-size:13px;margin-bottom:2px;}
  .icon-lg{width:88px;height:88px;border-radius:19px;display:grid;
           grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:9px;padding:17px;
           margin:0 auto 10px;box-shadow:0 6px 18px -10px rgba(0,0,0,.5);}
  .icon-lg.green{background:#7dd9c8;}
  .icon-lg.black{background:#000;}
  .icon-lg i{background:#fff;border-radius:4px;display:block;}
`;

const PLATE = '<span class="plate"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
const PANE  = '<div class="app-pane"><div></div><div></div><div></div><div></div><div></div></div>';
const FOUR  = '<i></i><i></i><i></i><i></i>';

const oldBar = `<div class="chrome"><span class="dots"><i></i><i></i><i></i></span>
  <span class="urlbar">volksswitch.github.io/keyguard-designer-web/<b>app.html</b></span></div>`;
const newBar = `<div class="chrome"><span class="dots"><i></i><i></i><i></i></span>
  <span class="urlbar"><b>keyguard.volksswitch.org</b>/app.html</span></div>`;
const winBar = `<div class="chrome appwin"><span class="dots"><i></i><i></i><i></i></span>
  <span class="urlbar">Keyguard Designer &mdash; installed app window</span></div>`;

const appTop = rel => `<div class="app-top"><span class="app-title">Keyguard Designer</span>
  <span class="app-rel">release ${rel}</span></div>`;
const appBody = `<div class="app-body"><div class="app-view">${PLATE}</div>${PANE}</div>`;

// ── the notices ────────────────────────────────────────────────────────────────
export const MOCKUPS = [
  {
    id: 'nag-before-arming',
    w: 760, h: 260,
    body: `<div class="screen">${oldBar}${appTop(21)}
      <div class="notice">
        <span class="ntext"><b>Keyguard Designer is moving to a new home.</b>
          Please save a copy of your settings now.</span>
        <span class="nbtns"><button class="btn pri">Save my settings</button>
        <button class="btn ghost">Not now</button></span>
      </div>${appBody}</div>`,
  },
  {
    id: 'nag-armed',
    w: 760, h: 260,
    body: `<div class="screen">${oldBar}${appTop(21)}
      <div class="notice">
        <span class="ntext"><b>Keyguard Designer is moving to a new home.</b>
          Please save a copy of your settings. We&rsquo;ll take you there straight away.</span>
        <span class="nbtns"><button class="btn pri">Save and move me</button>
        <button class="btn ghost">Not now</button></span>
      </div>${appBody}</div>`,
  },
  {
    id: 'saved-not-yet-armed',
    w: 760, h: 260,
    body: `<div class="screen">${oldBar}${appTop(21)}
      <div class="notice done">
        <span class="ntext"><b>Saved as keyguard-settings.json in your project folder.</b>
          Keep it until the app moves.</span>
      </div>${appBody}</div>`,
  },
  {
    id: 'arrival-settings-came',
    w: 700, h: 300,
    body: `<div class="screen">${newBar}
      <div class="modal-stage"><div class="modal">
        <h5>Keyguard Designer has moved</h5>
        <div class="mbody">
          <p>Your settings came with you. Please open your project again.</p>
        </div>
        <div class="mfoot"><button class="btn pri">Open a project&hellip;</button></div>
      </div></div></div>`,
  },
  {
    id: 'arrival-settings-lost',
    w: 700, h: 300,
    body: `<div class="screen">${newBar}
      <div class="modal-stage"><div class="modal">
        <h5>Keyguard Designer has moved</h5>
        <div class="mbody">
          <p>Your settings didn&rsquo;t come with it. Open your project and we&rsquo;ll put them back.</p>
        </div>
        <div class="mfoot"><button class="btn pri">Open a project&hellip;</button></div>
      </div></div></div>`,
  },
  {
    id: 'settings-restored',
    w: 700, h: 268,
    body: `<div class="screen">${newBar}
      <div class="modal-stage"><div class="modal">
        <h5>Your settings have been restored</h5>
        <div class="mbody">
          <p>Found in your project folder. Carry on where you left off.</p>
        </div>
        <div class="mfoot"><button class="btn pri">Got it</button></div>
      </div></div></div>`,
  },
  {
    // Deliberately the SAME bar as the save request on the old address. A link in
    // the arrival dialog lost outright to the dark primary button beside it (Ken,
    // 18 Aug 2026) — people press that and register nothing else. As a standing
    // notice it sits behind the launch gate, so they meet it once they are in the
    // app and able to act, and it returns every visit until pressed.
    id: 'cleanup-bar',
    w: 760, h: 260,
    body: `<div class="screen">${newBar}${appTop(100)}
      <div class="notice">
        <span class="ntext"><b>One more step to finish the move.</b></span>
        <span class="nbtns"><button class="btn pri">Show me how</button>
        <button class="btn ghost">Not now</button></span>
      </div>${appBody}</div>`,
  },
  {
    id: 'we-have-moved',
    w: 700, h: 300,
    body: `<div class="screen">${winBar}
      <div class="moved">
        <span class="mv-mark">${FOUR}</span>
        <h5>Keyguard Designer has moved</h5>
        <button class="btn pri">Take me to the app</button>
        <p>Use this button &mdash; it brings your settings with you.</p>
      </div></div>`,
  },
  {
    id: 'icons-old-new',
    w: 560, h: 200,
    body: `<div class="icons">
      <div class="iconcell"><span class="icon-lg green">${FOUR}</span>
        <b>Old address</b>Green plate, teal window frame</div>
      <div class="iconcell"><span class="icon-lg black">${FOUR}</span>
        <b>New address</b>Black plate, black window frame</div>
    </div>`,
  },
];

export const pageHtml = m => `<!doctype html><meta charset="utf-8">
<style>${CSS}</style><body>${m.body}</body>`;
