# MkDocs Documentation Setup

MkDocs provides a simple, beautiful documentation site that works locally and can be hosted on any domain.

## Local Development

### Install MkDocs

```bash
# Install Python dependencies
pip install -r docs/requirements.txt
```

### Run Locally

```bash
# Start local server
mkdocs serve -a 127.0.0.1:8001

# Access at: http://127.0.0.1:8001
```

The documentation will auto-reload when you edit markdown files.

### Run via Docker (recommended)

```bash
docker compose --profile frappe up -d docs
# Access at: http://localhost:8001
```

The docs container runs `mkdocs serve` **inside the container**; it does not create a `site/` folder on your machine. Edits to `docs/` and `mkdocs.yml` are mounted read-only and the container serves them live.

### Build static site (local only)

If you run `mkdocs build` **locally**, it creates a `site/` directory in the project root. That directory is **gitignored** so it is not committed. For serving docs, prefer Docker so the build stays in the container.

## Hosting Options

### Option 1: GitHub Pages (Free, Automatic)

1. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Source: GitHub Actions
   - The workflow (`.github/workflows/docs.yml`) will auto-deploy

2. **Access your docs**:
   - URL: `https://your-username.github.io/megatechtrackers/`
   - Updates automatically on every push to main/master

### Option 2: Netlify (Free, Easy)

1. **Connect repository** to Netlify
2. **Build settings**:
   - Build command: `pip install -r docs/requirements.txt && mkdocs build`
   - Publish directory: `site`
3. **Deploy** - Auto-deploys on every push

### Option 3: Custom Domain

1. Build the site: `mkdocs build`
2. Upload `site/` folder to any web hosting
3. Works on any domain (yourdomain.com/docs)

## Features

- ✅ **Works locally** - Just like Swagger UI
- ✅ **Beautiful UI** - Material theme
- ✅ **Search** - Built-in search functionality
- ✅ **Mobile responsive** - Works on all devices
- ✅ **Dark mode** - Automatic theme switching
- ✅ **Auto-deploy** - Updates on code changes
- ✅ **Free hosting** - GitHub Pages or Netlify

## Customization

Edit `mkdocs.yml` to:
- Change theme colors
- Add/remove navigation items
- Configure plugins
- Set custom domain

## Comparison to Swagger

| Feature | Swagger UI | MkDocs |
|---------|-----------|--------|
| Local server | ✅ | ✅ |
| Host on domain | ✅ | ✅ |
| Auto-updates | ✅ | ✅ |
| Search | ✅ | ✅ |
| For APIs | ✅ | ❌ |
| For general docs | ❌ | ✅ |

**Best of both worlds**: Use Swagger for APIs, MkDocs for general documentation!
