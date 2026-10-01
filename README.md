# 瑞穂県ホームページ

A website for 瑞穂県, a fictional prefecture invented by my son.

- **Site:** https://cmfnyc.github.io/mizuho-ken/
- **Edit mode:** add `#edit` to the address, or tap **編集** at the very bottom of any page.

The site is hidden from search engines, but the site and this repository are public. Don't put real names, the school's name, or photos of real people on it.

---

## How it fits together

| Part | Where | What it does |
|---|---|---|
| The website | `docs/` on GitHub Pages | `index.html` (layout and styles), `app.js` (code), `content.js` (all the words and the list of pictures), `images/` (the drawings) |
| The relay | A Google Apps Script attached to a Google Sheet (`relay/Code.gs`) | Saves 掲示板 posts in the Sheet, and passes 編集モード saves on to GitHub |
| Settings | `docs/config.js` | Holds the relay's web address |

The GitHub key lives only inside the Google script's settings. It's never in the website, so visitors can't see it.

---

## One-time setup (about 20 minutes, on the Mac)

### 1. Make a GitHub key that can only touch this site

1. Go to **github.com → your picture (top right) → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Fill in:
   - **Token name:** `mizuho relay`
   - **Expiration:** 1 year. Set a reminder to renew it.
   - **Repository access:** *Only select repositories* → `cmfnyc/mizuho-ken`
   - **Permissions → Repository permissions → Contents:** *Read and write*
3. Click **Generate token** and copy it. You'll paste it in step 2.6, and you can't view it again after you leave the page.

### 2. Set up the relay

1. Go to sheets.google.com and create a blank spreadsheet named `瑞穂県 掲示板`.
2. Choose **Extensions → Apps Script**.
3. Delete everything in `Code.gs`, paste in all of `relay/Code.gs`, and click 💾 **Save**.
4. Click ⚙️ **Project Settings** (left sidebar). Scroll to **Script Properties**.
5. Click **Add script property** and add these two:
   - `EDIT_PASSCODE` → a passcode for your son. Make it something other people won't guess.
   - `GITHUB_TOKEN` → the token from step 1.
6. Click **Save script properties**.
7. Click **Deploy → New deployment**, then click the ⚙️ gear and choose **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy**, then **Authorize access**. Google warns that the app isn't verified: click **Advanced → Go to (project name)**, then **Allow**. It's your own script.
9. Copy the **Web app URL**. It ends in `/exec`.

### 3. Connect the site to the relay

Send Claude the Web app URL. Claude puts it in `docs/config.js` and publishes. (To do it yourself, paste it between the quotes in `docs/config.js` on github.com and commit.)

Then open the site on the iPad, post on the 掲示板, and try 編集モード.

---

## Using 編集モード (for your son)

1. At the bottom of any page, tap **編集**. Type the passcode and tap **編集をはじめる**.
2. Every piece of text has a dashed outline. Tap it and type.
3. **写真をえらぶ** under a picture opens the iPad's photos. Pick a drawing and it appears right away. **写真を消す** removes it.
4. **＋ 〇〇を追加** adds a new person, city, wanted criminal, timeline row, and so on.
5. **↑ 上へ** and **↓ 下へ** change the order. **削除** removes an entry; tap it twice to confirm.
6. When finished, tap **保存** on the yellow bar at the bottom. The public site updates in 1–2 minutes.
7. Tap **編集を終わる** to leave edit mode.

While in edit mode, each 掲示板 post also has a **削除** button for removing rule-breaking posts.

**If saving says the site was updated somewhere else:** someone (or Claude) changed the site after edit mode opened. His changes are still on screen. **上書きして保存** saves his version over the other one. To keep both, copy his text somewhere, reload, and redo the changes.

## Changing the relay later

After editing `Code.gs` in Apps Script, choose **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Removing board posts from the Sheet

Posts are rows in the `掲示板` tab of the spreadsheet. Deleting a row removes that post.
