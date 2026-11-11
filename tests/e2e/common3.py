import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import json, os, time
from playwright.sync_api import sync_playwright
Q="Please write an email to my classmate saying I cannot join today's group meeting, and I will finish my part offline and update the group chat."
ROOT=str(PROJECT_ROOT)
def logpath(pid): return f'{ROOT}/src/data/logs/{pid}.jsonl'
def readlog(pid): return [json.loads(l) for l in open(logpath(pid))] if os.path.exists(logpath(pid)) else []
def counts():
    p=f'{ROOT}/model_service/data/counts.json'
    return json.load(open(p)) if os.path.exists(p) else {'records':[],'shows':[]}
def setup(p, cond, pid, user, power=True):
    b = p.chromium.launch(channel='chrome', headless=True, ignore_default_args=['--hide-scrollbars'])
    pg = b.new_page(viewport={'width':1700,'height':1100})
    pg.on('pageerror', lambda e: print('pageerror:', str(e)[:300]))
    pg.goto(f'{BASE_URL}/?pid={pid}')
    pg.wait_for_timeout(1000)
    pg.fill('input[placeholder="Enter username"]',user)
    pg.press('input[placeholder="Enter username"]','Enter')
    pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q)
    pg.locator('button').nth(1).click()
    pg.wait_for_timeout(2500)
    pg.wait_for_function("document.body.innerText.match(/Email Components \\((\\d+)\\)/) && parseInt(document.body.innerText.match(/Email Components \\((\\d+)\\)/)[1])>0", timeout=900000)
    pg.wait_for_function("!document.querySelector('button.ant-btn-loading') && !document.querySelector('.draft-generating-page')", timeout=900000)
    pg.wait_for_timeout(3000)
    return b, pg
def open_cards(pg, tag_index):
    pg.locator('.intentCards .ant-tag').nth(tag_index).click()
    for i in range(6):
        pg.wait_for_function("document.querySelector('.vc-card') || document.body.innerText.includes('generate versions. Try again')", timeout=900000)
        if pg.locator('.vc-card').count(): return
        pg.get_by_role('button', name='Retry').click()
    raise Exception('cards never loaded')
def wait_event(pid, name, timeout=240):
    t=time.time()
    while time.time()-t<timeout:
        ev=[e for e in readlog(pid) if e['event']==name]
        if ev: return ev
        time.sleep(1)
    return []

MSLOG=os.environ.get('MODEL_SERVICE_LOG', os.path.expandvars('$TMPDIR/ms.log'))
def ms_count(path):
    return sum(1 for l in open(MSLOG) if f'POST {path} ' in l)
def expected_counts(pid):
    ev=readlog(pid); exp={}
    def bump(v,i):
        exp.setdefault(v.lower().rstrip('.'),[0,0])[i]+=1
    for e in ev:
        if e['event']=='pick':
            for v in e['shown_values']: bump(v, 0 if v==e['chosen_value'] else 1)
        elif e['event'] in ('regenerate','leave'):
            for v in e['shown_values']: bump(v,1)
    return exp
def actual_counts(pid):
    return {r['value'].lower().rstrip('.'): r['counts'] for r in counts()['records'] if r['pid']==pid}
def wait_n(pid, name, n, timeout=300):
    t=time.time()
    while time.time()-t<timeout:
        if len([e for e in readlog(pid) if e['event']==name])>=n: return True
        time.sleep(1)
    return False
def cards_text(pg): return pg.locator('.vc-card .ant-tag').all_inner_texts()

def cursor_into_unit(pg):
    """Move the cursor into the yellow unit with the keyboard (clicking it would open the QuickFix toolbar)."""
    pg.locator('[data-slate-editor="true"]').get_by_text('Subject:').first.click(); pg.wait_for_timeout(300)
    for _ in range(12):
        inside = pg.evaluate("""() => { const s = window.getSelection(); if (!s.anchorNode) return false;
            const el = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode;
            return !!el.closest('span[style*="255, 243, 196"]'); }""")
        if inside: return True
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(120)
    return False
