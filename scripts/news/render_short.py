#!/usr/bin/env python3
"""Fetch news → render branded 1080x1920 slides → assemble a vertical Short
(short.mp4) + meta.json into NEWS_OUT. Ported faithfully from tldr-social so the
channel output stays pixel-identical; only OUT/ffmpeg/logo paths are env-driven.

Env: NEWS_OUT (output dir), FFMPEG_BIN, NEWS_LOGO, API_BASE, APP_LINK,
     LANG_CODE=en, N_STORIES=3, CATEGORY=All, SLIDE_SECS=5, MOTION=1, VOICEOVER=1, VOICE
Requires (in .venv): playwright (+ chromium via `playwright install chromium`), edge-tts.
"""
import json, os, re, sys, subprocess, urllib.request, urllib.parse, html as _html, datetime, base64
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('NEWS_OUT') or os.path.join(HERE, 'output')
os.makedirs(OUT, exist_ok=True)
API = os.environ.get('API_BASE', 'https://bharat-briefs.vercel.app')
APP_LINK = os.environ.get('APP_LINK', 'https://play.google.com/store/apps/details?id=com.prashant.tldrbharat')
LANG = os.environ.get('LANG_CODE', 'en')
CATEGORY = os.environ.get('CATEGORY', 'All')
N = int(os.environ.get('N_STORIES', '3'))
SECS = float(os.environ.get('SLIDE_SECS', '5'))
MOTION = os.environ.get('MOTION', '1') == '1'
VOICEOVER = os.environ.get('VOICEOVER', '1') == '1'
VOICE = os.environ.get('VOICE', 'hi-IN-SwaraNeural' if LANG == 'hi' else 'en-IN-NeerjaNeural')
FPS = 30
FADE = 0.6
PAD = FADE + 0.7          # breathing room after each narration line
MIN_SLIDE = 3.2
FFMPEG = os.environ.get('FFMPEG_BIN') or os.path.join(HERE, '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')
LOGO_PATH = os.environ.get('NEWS_LOGO') or os.path.join(HERE, 'assets', 'logo.png')

# Intro/outro narration per language (story lines come from the article text).
NARR = {
    'en': {
        'intro': lambda cat: ("Today's top stories from India, on Bharat Briefs."
                              if cat == 'All' else f"Today's top {cat} stories from India, on Bharat Briefs."),
        'outro': "Get Bharat Briefs on Google Play for your daily India brief. Follow for more.",
    },
    'hi': {
        'intro': lambda cat: "भारत की आज की प्रमुख खबरें, भारत ब्रीफ्स पर।",
        'outro': "रोज़ की खबरों के लिए भारत ब्रीफ्स गूगल प्ले से डाउनलोड करें। फॉलो करें।",
    },
}


def narr_lang():
    return NARR.get(LANG, NARR['en'])


def story_narration(a):
    """What the voice reads for a story slide: headline + its first bullet."""
    title = (a.get('title') or '').strip()
    b0 = ((a.get('bullets') or [''])[0]).strip()
    text = f"{title}. {b0}" if b0 else title
    return re.sub(r'\s+', ' ', text)


def ff_duration(path):
    """Seconds of an audio/video file, parsed from ffmpeg -i."""
    out = subprocess.run([FFMPEG, '-i', path], capture_output=True).stderr.decode(errors='ignore')
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', out)
    if not m:
        return 0.0
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def tts(text, path):
    subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', VOICE,
                    '--text', text, '--write-media', path], check=True, capture_output=True)

with open(LOGO_PATH, 'rb') as _f:
    LOGO = 'data:image/png;base64,' + base64.b64encode(_f.read()).decode()

CATEGORY_EMOJI = {
    'Indian Politics': '🏛️', 'International': '🌍', 'Economy': '📈', 'Sports': '🏆',
    'Technology': '💻', 'Entertainment': '🎬', 'Education': '📚',
    'Health & Environment': '🌱', 'Horoscope': '🔮', 'All': '📋',
}

CATEGORY_HI = {
    'Indian Politics': 'भारत की राजनीति', 'International': 'अंतरराष्ट्रीय', 'Economy': 'अर्थव्यवस्था',
    'Sports': 'खेल', 'Technology': 'टेक्नोलॉजी', 'Entertainment': 'मनोरंजन', 'Education': 'शिक्षा',
    'Health & Environment': 'स्वास्थ्य और पर्यावरण', 'Horoscope': 'राशिफल', 'All': 'मुख्य खबरें',
}


def cat_label(c):
    """Category name shown on the pill/intro — localized for Hindi."""
    return CATEGORY_HI.get(c, c) if LANG == 'hi' else c


def esc(s): return _html.escape(s or '')


# Content safety filter — keep graphic/tragic/sensational stories out of the
# auto-posted Shorts (e.g. a murder case mislabeled "Indian Politics").
SENSITIVE = re.compile(
    r'\b(murder|murders|murdered|rape|raped|rapist|molest|suicide|kills?|killed|killing|'
    r'dead|death|deaths|corpse|stabb\w*|shot\s+dead|hang(?:ed|ing)|beheaded|acid\s+attack|'
    r'gang\s?rape|sexual|assault|self[-\s]?harm|body\s+found|dismember\w*|gruesome|lynch\w*)\b',
    re.I)


def is_clean(a):
    text = (a.get('title') or '') + ' ' + ' '.join(a.get('bullets') or [])
    return not SENSITIVE.search(text)


def fetch_stories():
    qs = urllib.parse.urlencode({'lang': LANG, 'category': CATEGORY})
    req = urllib.request.Request(f'{API}/api/v1/feed?{qs}', headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        items = json.load(r).get('items', [])
    clean = [a for a in items if is_clean(a)]
    dropped = len(items) - len(clean)
    if dropped:
        print(f'  content filter: dropped {dropped} sensitive/graphic story(ies)')
    withimg = [a for a in clean if a.get('image_url')]
    picked, seen, out = (withimg + clean), set(), []
    for a in picked:
        if a['id'] in seen:
            continue
        seen.add(a['id']); out.append(a)
    return out[:N]


SHELL = """<!doctype html><html><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; -webkit-font-smoothing:antialiased; }}
html,body {{ width:1080px; height:1920px; overflow:hidden;
  /* Explicit families so Linux (GitHub Actions) uses the installed Noto fonts
     for Latin + Devanagari/Tamil/Telugu/Kannada instead of falling back to a
     CJK font (which renders Latin full-width) or tofu. -apple-system keeps Mac
     rendering identical. */
  font-family:-apple-system,'Noto Sans','Noto Sans Devanagari','Noto Sans Tamil','Noto Sans Telugu','Noto Sans Kannada','Segoe UI',Roboto,'DejaVu Sans',Arial,'Noto Color Emoji',sans-serif;
  background:#0a0a0c; color:#f4f4f6; }}
.wrap {{ width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; }}
</style></head><body>{content}</body></html>"""


def logo_tile(px, radius=None):
    r = radius or int(px * 0.26)
    inner = int(px * 0.84)
    return (f'<div style="width:{px}px;height:{px}px;border-radius:{r}px;background:#fff;'
            f'display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.35)">'
            f'<img src="{LOGO}" style="width:{inner}px;height:{inner}px;object-fit:contain"></div>')


def brand_corner():
    return (f'<div style="position:absolute;top:44px;left:52px;display:flex;align-items:center;gap:15px;z-index:5">'
            f'{logo_tile(62)}'
            f'<div><div style="font-size:29px;font-weight:900;letter-spacing:-1px;line-height:1">BHARAT</div>'
            f'<div style="font-size:14px;font-weight:900;letter-spacing:6px;color:#F2591C;margin-top:2px">BRIEFS</div></div></div>')


def progress_bar(idx, total):
    segs = ''.join(
        f'<div style="flex:1;height:7px;border-radius:4px;background:{"#F2591C" if i < idx else "rgba(255,255,255,.22)"}"></div>'
        for i in range(total))
    return f'<div style="position:absolute;top:0;left:0;right:0;display:flex;gap:8px;padding:22px 52px;z-index:6">{segs}</div>'


def story_slide(a, idx, total):
    img = a.get('image_url')
    emoji = CATEGORY_EMOJI.get(a.get('category'), '📰')
    hero = (f'<img src="{esc(img)}" onerror="this.style.display=\'none\'" '
            f'style="width:100%;height:100%;object-fit:cover">' if img else
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:220px;opacity:.14">'
            + emoji + '</div>')
    bl = ''.join(
        f'<div style="display:flex;gap:22px;align-items:flex-start;margin-bottom:30px">'
        f'<div style="width:15px;height:15px;border-radius:8px;background:#F2591C;margin-top:15px;flex:none;box-shadow:0 0 16px rgba(242,89,28,.6)"></div>'
        f'<div style="font-size:39px;line-height:1.36;font-weight:500;color:#e2e2e6">{esc(b)}</div></div>'
        for b in (a.get('bullets') or [])[:3])
    content = f"""<div class="wrap">
      <div style="height:820px;position:relative;background:linear-gradient(135deg,#26262b,#0a0a0c)">
        {hero}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,12,.05) 45%,rgba(10,10,12,.72) 82%,#0a0a0c)"></div>
        {progress_bar(idx, total)}
        {brand_corner()}
        <div style="position:absolute;top:104px;right:48px;font-size:150px;font-weight:900;color:rgba(255,255,255,.10);line-height:1">{idx:02d}</div>
        <div style="position:absolute;bottom:34px;left:52px;background:#F2591C;padding:13px 30px;border-radius:32px;font-size:25px;font-weight:800;letter-spacing:.5px;box-shadow:0 8px 24px rgba(242,89,28,.45)">{emoji}&nbsp; {esc(cat_label(a.get('category')).upper())}</div>
      </div>
      <div style="flex:1;padding:52px 52px 0 52px">
        <div style="font-size:62px;line-height:1.13;font-weight:800;letter-spacing:-1.8px;margin-bottom:24px">{esc(a.get('title'))}</div>
        <div style="width:96px;height:6px;border-radius:3px;background:#F2591C;margin-bottom:40px"></div>
        {bl}
      </div>
      <div style="padding:0 52px 60px 52px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:11px;height:11px;border-radius:6px;background:#F2591C"></div>
          <div style="font-size:26px;font-weight:700;color:#9a9aa0">{esc(a.get('source_name'))}</div>
        </div>
        <div style="font-size:24px;font-weight:800;color:#8a8790">▶ Google Play</div>
      </div>
    </div>"""
    return SHELL.format(content=content)


def intro_slide(label):
    today = datetime.datetime.now().strftime('%d %B %Y')
    content = f"""<div class="wrap" style="justify-content:center;align-items:center;text-align:center;
        background:radial-gradient(circle at 50% 32%,#24231f,#0a0a0c 72%)">
      {brand_corner()}
      <div style="margin-bottom:50px">{logo_tile(172)}</div>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#F2591C;margin-bottom:24px">BHARAT BRIEFS</div>
      <div style="font-size:88px;font-weight:900;letter-spacing:-2.5px;line-height:1.04;padding:0 64px">{esc(label)}</div>
      <div style="width:120px;height:7px;border-radius:4px;background:#F2591C;margin:34px 0"></div>
      <div style="font-size:33px;font-weight:600;color:#9a9aa0">{today}</div>
      <div style="position:absolute;bottom:112px;font-size:29px;font-weight:700;color:#c8c8cc">📲 Available on Google Play</div>
    </div>"""
    return SHELL.format(content=content)


def outro_slide():
    content = f"""<div class="wrap" style="justify-content:center;align-items:center;text-align:center;
        background:radial-gradient(circle at 50% 38%,#F2591C,#7a2c0e 76%,#3a1406)">
      <div style="margin-bottom:42px">{logo_tile(180)}</div>
      <div style="font-size:50px;font-weight:900;letter-spacing:6px;color:#fff">BHARAT BRIEFS</div>
      <div style="font-size:30px;font-weight:700;color:#ffe0d2;margin-top:14px;letter-spacing:3px">4.8 ★★★★★</div>
      <div style="font-size:112px;font-weight:900;letter-spacing:-3px;color:#fff;margin-top:38px">Stay informed.</div>
      <div style="font-size:39px;font-weight:600;color:#ffd9c8;margin-top:26px;padding:0 96px;line-height:1.35">Your daily India brief — in the language you love.</div>
      <div style="margin-top:60px;background:#0a0a0c;padding:32px 74px;border-radius:52px;font-size:46px;font-weight:800;color:#fff;box-shadow:0 18px 46px rgba(0,0,0,.45)">Download free&nbsp; ↗</div>
      <div style="font-size:30px;font-weight:600;color:#ffd9c8;margin-top:32px">On Google Play · link in bio</div>
    </div>"""
    return SHELL.format(content=content)


def main():
    stories = fetch_stories()
    if not stories:
        raise SystemExit(f'No stories for {CATEGORY}/{LANG}')
    label = ("मुख्य खबरें" if LANG == "hi" else "Today's Top Stories") if CATEGORY == "All" else cat_label(CATEGORY)
    print(f'Fetched {len(stories)} stories ({CATEGORY}/{LANG})')

    pages = [intro_slide(label)] + \
            [story_slide(a, i + 1, len(stories)) for i, a in enumerate(stories)] + \
            [outro_slide()]

    n = len(pages)

    for f in os.listdir(OUT):
        if f.startswith(('slide_', 'vo_', 'seg_')) or f in ('short.mp4', 'narration.wav'):
            os.remove(os.path.join(OUT, f))

    # ── Narration (edge-tts) → per-slide audio + durations ─────────────────────
    nl = narr_lang()
    narr_texts = [nl['intro'](CATEGORY)] + [story_narration(a) for a in stories] + [nl['outro']]
    if VOICEOVER:
        print(f'Voicing {n} lines with {VOICE}…')
        durs = []
        for i, text in enumerate(narr_texts):
            vo = os.path.join(OUT, f'vo_{i:02d}.mp3')
            tts(text, vo)
            durs.append(max(MIN_SLIDE, ff_duration(vo) + PAD))
    else:
        durs = [SECS] * n

    # ── Render slides ──────────────────────────────────────────────────────────
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
        for i, h in enumerate(pages):
            pg.set_content(h, wait_until='load')
            try:
                pg.wait_for_load_state('networkidle', timeout=6000)
            except Exception:
                pass
            pg.wait_for_timeout(500)
            pg.screenshot(path=os.path.join(OUT, f'slide_{i:02d}.png'))
        b.close()
    print(f'  rendered {n} slides')

    total = sum(durs) - (n - 1) * FADE

    # ── Narration track: pad each line to its slide's on-screen slot, concat ───
    if VOICEOVER:
        listfile = os.path.join(OUT, 'segs.txt')
        with open(listfile, 'w') as lf:
            for i in range(n):
                slot = durs[i] - FADE if i < n - 1 else durs[i]
                seg = os.path.join(OUT, f'seg_{i:02d}.wav')
                subprocess.run([FFMPEG, '-y', '-i', os.path.join(OUT, f'vo_{i:02d}.mp3'),
                                '-af', 'apad', '-t', f'{slot:.3f}', '-ar', '44100', '-ac', '1', seg],
                               check=True, capture_output=True)
                lf.write(f"file '{seg}'\n")
        subprocess.run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', listfile,
                        '-ar', '44100', '-ac', '1', os.path.join(OUT, 'narration.wav')],
                       check=True, capture_output=True)

    # ── Assemble video (variable slide durations + push/fade transitions) ──────
    cmd = [FFMPEG, '-y']
    for i in range(n):
        cmd += ['-i', os.path.join(OUT, f'slide_{i:02d}.png')]
    if VOICEOVER:
        cmd += ['-i', os.path.join(OUT, 'narration.wav')]  # input index n

    parts, labels = [], []
    for i in range(n):
        fr = max(1, round(durs[i] * FPS))
        parts.append(f"[{i}:v]scale=1080:1920,zoompan=z=1:d={fr}:s=1080x1920:fps={FPS},setsar=1[m{i}]")
        labels.append(f'[m{i}]')

    def transition_for(i):
        return 'fade' if (i == 1 or i == n - 1) else 'smoothleft'

    prev, start = labels[0], 0.0
    for i in range(1, n):
        start += durs[i - 1] - FADE
        parts.append(f'{prev}{labels[i]}xfade=transition={transition_for(i)}:duration={FADE}:offset={start:.3f}[x{i}]')
        prev = f'[x{i}]'
    parts.append(f'{prev}format=yuv420p[vout]')
    if VOICEOVER:
        parts.append(f"[{n}:a]volume=1.35,afade=t=out:st={max(0, total-0.4):.2f}:d=0.4[aout]")
    fc = ';'.join(parts)

    cmd += ['-filter_complex', fc, '-map', '[vout]']
    if VOICEOVER:
        cmd += ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k']
    cmd += ['-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
            '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', os.path.join(OUT, 'short.mp4')]
    print(f'Assembling video ({"voiceover" if VOICEOVER else "silent"}, push/fade transitions)…')
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print(r.stderr.decode()[-1800:])
        raise SystemExit('ffmpeg failed')
    print(f'✅ short.mp4  ({total:.0f}s)')

    cat_tag = '' if CATEGORY == 'All' else f'{CATEGORY} '
    meta = {
        'title': f"{cat_tag}News Today | Bharat Briefs #Shorts",
        'description': (
            f"Today's top {CATEGORY} stories from India — 3 bullets each, zero clickbait.\n\n"
            + '\n'.join(f"• {s.get('title')}" for s in stories)
            + f"\n\n📲 Get Bharat Briefs on Google Play (5 languages, free):\n{APP_LINK}\n\n"
            + f"#Shorts #IndiaNews #{CATEGORY.replace(' ', '')} #News #BharatBriefs #DailyNews"
        ),
        'tags': ['India news', 'news', 'shorts', CATEGORY, 'daily news', 'bharat briefs', 'headlines'],
        'stories': [s.get('title') for s in stories],
    }
    with open(os.path.join(OUT, 'meta.json'), 'w') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('✅ meta.json')


if __name__ == '__main__':
    main()
