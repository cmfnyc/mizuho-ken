# 瑞穂県ホームページ — notes for Claude

The site belongs to Chad's son, who is a child. It's public on GitHub Pages at cmfnyc.github.io/mizuho-ken, marked noindex. Never add real personal information.

- Every bit of site text lives in `docs/content.js` (JSON assigned to `window.MIZUHO_CONTENT`). All visible text on the site must be Japanese.
- He edits through 編集モード on the live site. Each save is a commit by the relay ("編集モードから更新 (rev N)"). **Always `git pull` before editing**, or his work gets overwritten.
- If you edit `content.js` by hand, **add 1 to `meta.rev`**. The relay uses rev to detect conflicting saves.
- New images uploaded through edit mode are `docs/images/p-*.jpg`, compressed to 1200px JPEG in the browser.
- `relay/Code.gs` is a copy of the Apps Script code. It's deployed by hand from Chad's Google account, and changing it means redeploying a new version there.
- `_old-claude-version/` is the earlier claude.ai artifact version (https://claude.ai/artifact/EvQBauH9voDsA6XFxsXouf). It's git-ignored and superseded.
- He edits from the family's home iPad. Not meant for his school iPad (Chad prefers it not be used at school). The relay runs in Chad's PERSONAL Google account, never the work one.
