# Hicks & Fowler — GitHub Pages site

A lightweight, static, multi-page site built for GitHub Pages.

## Files

- `index.html` — home
- `shows.html` — upcoming shows
- `music.html` — streaming/video/social links
- `about.html` — short band bio
- `contact.html` — booking + contact
- `assets/css/styles.css` — shared styling
- `assets/js/main.js` — mobile nav + current year
- `assets/images/favicon.svg` — lightweight favicon
- `.nojekyll` — tells GitHub Pages to serve the site as plain static files

## Before publishing

Search the project for `ADD` and replace the placeholders:
- Booking email
- Streaming link(s)
- Video link(s)
- Social link(s)

## First push

If this folder is already your local `hicksandfowler` repository:

```bash
git add .
git commit -m "Build new Hicks and Fowler site"
git push origin main
```

If you created the folder but have not connected it to GitHub yet:

```bash
git init
git add .
git commit -m "Build new Hicks and Fowler site"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/hicksandfowler.git
git push -u origin main
```

## Turn on GitHub Pages

On GitHub:

1. Open the `hicksandfowler` repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Branch: `main`
5. Folder: `/ (root)`
6. Save.

Your temporary project URL will normally be:

`https://YOUR-GITHUB-USERNAME.github.io/hicksandfowler/`

All navigation uses relative URLs, so the same files will work after you point `hicksandfowler.com` to GitHub Pages.

## Custom domain

Do this only after the GitHub Pages test URL is working. Then set the custom domain in **Settings → Pages** and update the DNS records at the company where the domain is managed.
