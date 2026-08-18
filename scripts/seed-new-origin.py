# -*- coding: utf-8 -*-
"""seed-new-origin.py <in app.html> <out app.html>

Produces the release-100 app from the release-21 one by DELETING every block
fenced with DEPARTURE-ONLY markers. It only ever deletes — nothing is written
by hand, so nothing can be got wrong.

What goes: asking for a copy of the settings, the arming probe, and the crossing
itself. None of it belongs on the new address, where nobody is going anywhere,
and a nag that forces a save is a migration measure rather than a feature
(Ken, 18 Aug 2026).

What stays: taking delivery of settings, putting them back from the project
folder, the reminder to retire the old bookmark and icon, and saving/loading a
copy from the About tab — which is where saving lives once the banner is gone.

Run the app afterwards and check the About tab offers Save and Load, and that no
banner appears."""
import io, re, sys
src, dst = sys.argv[1], sys.argv[2]
raw = io.open(src, 'rb').read().decode('utf-8')
crlf = raw.count('\r\n') > 0
lines = raw.replace('\r\n', '\n').split('\n')

out, depth, removed, blocks = [], 0, 0, 0
for ln in lines:
    if 'DEPARTURE-ONLY START' in ln:
        depth += 1; blocks += 1; removed += 1; continue
    if 'DEPARTURE-ONLY END' in ln:
        depth -= 1; removed += 1
        if depth < 0: sys.exit('unbalanced markers')
        continue
    if depth: removed += 1; continue
    out.append(ln)
if depth: sys.exit('unclosed marker')
s = '\n'.join(out)
io.open(dst, 'wb').write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))
print('stripped %d blocks, %d lines' % (blocks, removed))
for name in ('moveIfDue', 'movePayload', 'moveTearDown', 'moveIsArmed',
             'saveCopyDue', 'checkForSettingsCopy', 'wireMoveNotice',
             'showMoveNotice', 'renderMoveNotice', 'move-notice'):
    print('   departure gone: %-22s %s' % (name, name not in s))
print()
for name in ('MOVE_ARRIVAL', 'showArrivalScreen', 'restoreFromProjectFolderIfPending',
             'readSettingsFileFromProject', 'saveSettingsCopy', 'restoreSettingsFromFile',
             'wireAboutSettings', 'cleanupDue', 'cleanReload'):
    print('   arrival kept:   %-34s %s' % (name, name in s))
