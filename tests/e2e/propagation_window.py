import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, time, re, urllib.request
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
BASE=BASE_URL+'/?pid=zz_prop'
Q="Write a playful teasing email to my girlfriend, calling her a pig because she ate all my snacks, and ask her to restock the pantry this weekend."
ED='[data-slate-editor="true"]'; U=ED+' .unit-leaf'
LOG=f'{PROJECT_ROOT}/src/data/logs/zz_prop.jsonl'
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
def unit_text(pg,uid): return pg.evaluate("[...document.querySelectorAll('[data-unit=\"%s\"]')].map(e=>e.textContent).join('')"%uid)
def click_unit(pg,uid):
    pg.mouse.click(5,5); pg.wait_for_timeout(300)
    if pg.locator(f'{U}[data-unit="{uid}"]').count()==0:
        print('unit not found in the editor:', uid, [pg.locator(U).nth(i).get_attribute('data-unit') for i in range(pg.locator(U).count())]); return False
    pg.locator(f'{U}[data-unit="{uid}"]').first.scroll_into_view_if_needed()
    pt=pg.locator(f'{U}[data-unit="{uid}"]').first.evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}")
    pg.mouse.click(pt[0],pt[1]); pg.wait_for_timeout(900); return True
DIMS=[]
def pills(pg):
    out=[]
    for t in pg.locator('.intentCards .ant-tag').all_inner_texts():
        m=[d for d in DIMS if t.strip().lower().startswith(d)]
        if m: out.append(max(m,key=len))
    return out
def pill(pg,d): return pg.locator('.intentCards .ant-tag').filter(has_text=re.compile('^'+re.escape(d),re.I)).first
def wait_cards(pg):
    pg.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(600)
def use(pg,src,d,n):
    click_unit(pg,src); pill(pg,d).click(); wait_cards(pg)
    pg.locator('.vc-card').nth(n).get_by_role('button', name='Use').click()
def use_until_asked(pg,src,d):
    for n in range(4):
        k=len(CALLS); use(pg,src,d,n); pg.wait_for_timeout(4000)
        if len(CALLS)>k: return True
    return False
def events(name): return [json.loads(l) for l in open(LOG) if json.loads(l)['event']==name] if __import__('os').path.exists(LOG) else []
CALLS=[]
def stub_check(pg, mode):
    pg.unroute('**/intent-consistency-check')
    if mode=='real': return
    def h(route):
        CALLS.append(mode)
        if mode=='fail': return route.fulfill(status=500, content_type='application/json', body='{"error":"x"}')
        d=json.loads(route.request.post_data)
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'results':[{'id':t['id'],'needs_change':(mode=='all') or (mode=='mixed' and i==0),'reason':'STUB reason '+t['id']} for i,t in enumerate(d['targets'])]}))
    pg.route('**/intent-consistency-check', h)
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome', headless=True)
    pg=b.new_context(viewport={'width':1700,'height':1100}).new_page(); errs=[]; bad=[]
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('response', lambda r: bad.append((r.status,r.url[:70])) if r.status>=400 and 'consistency' not in r.url else None)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZPROP'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    units=list(dict.fromkeys([pg.locator(U).nth(i).get_attribute('data-unit') for i in range(pg.locator(U).count()) if pg.locator(U).nth(i).get_attribute('data-unit')]))
    cur=None
    for t in pg.evaluate("()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('intents/current.json'))"):
        cur=json.load(urllib.request.urlopen(t)); break
    DIMS.extend(i['dimension'].strip().lower() for i in cur)
    per={}
    for u in units: click_unit(pg,u); per[u]=pills(pg)
    count={}
    for ps in per.values():
        for d in ps: count[d]=count.get(d,0)+1
    shared=[d for d,n in sorted(count.items(), key=lambda kv:-kv[1]) if n>=2]
    print('pills per unit',per); print('shared',shared)
    check('an intent is shared by at least two units', len(shared)>0)
    d=shared[0]; src=[u for u in units if d in per[u]][0]; others=[u for u in units if d in per[u] and u!=src]
    snap=lambda: {u:unit_text(pg,u) for u in units}
    # 0. the real model (first, while every other unit still has its original value): the window opens exactly when the log says a unit does not fit
    stub_check(pg,'real'); before=len(events('consistency_checked'))
    use(pg,src,d,0)
    t0=time.time()
    while time.time()-t0<120 and len(events('consistency_checked'))<=before: time.sleep(1)
    ev=events('consistency_checked'); last=ev[-1] if ev else None
    time.sleep(1.5); shown=pg.locator(MODAL).count()==1
    check('5 real model: consistency_checked is logged', len(ev)>before and last and not last['check_failed'], json.dumps(last)[:200] if last else '')
    if last: check('5b real model: the window opens exactly when a part does not fit', shown==bool(last['inconsistent_units']), f'shown={shown} inconsistent={last["inconsistent_units"]}')
    if shown: pg.locator(MODAL).get_by_role('button', name='Skip').click()
    # 1. the check says "needs a change": the window opens, with the reason, and nothing is written before the user answers
    stub_check(pg,'all'); before=snap()
    use_until_asked(pg,src,d); pg.locator(MODAL).wait_for(timeout=60000)
    check('1 a part that no longer fits opens the window', pg.locator(MODAL).count()==1)
    check('1c nothing else changed while the window is open', all(unit_text(pg,u)==before[u] for u in others))
    pg.wait_for_function("!document.querySelector('.ant-modal .ant-spin')", timeout=300000); pg.wait_for_timeout(500)
    n=pg.locator('.propagation-item').count(); ready=pg.locator('.propagation-item input[type=checkbox]:not([disabled])').count()
    check('1d every flagged unit is listed, rewrites arrive with changed sentences in green', n>=len(others) and ready>0 and pg.locator('.propagation-item span[style*="227, 245, 234"]').count()>0, f'items={n} ready={ready}')
    if ready>=2: pg.locator('.propagation-item').nth(0).locator('input[type=checkbox]').uncheck(); pg.wait_for_timeout(300)
    picked=[pg.locator('.propagation-item').nth(i).locator('strong').inner_text() for i in range(n) if pg.locator('.propagation-item').nth(i).locator('input[type=checkbox]').is_checked()]
    pg.locator(MODAL).get_by_role('button', name='Apply selected').click(); pg.wait_for_timeout(2500)
    after=snap(); changed=[u for u in others if after[u]!=before[u]]
    check('1e the window closes and only the ticked units changed', pg.locator(MODAL).count()==0 and len(changed)==len(picked), f'changed={len(changed)} picked={picked}')
    if changed:
        pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
        check('1f Cmd+Z takes the rewrites back', all(unit_text(pg,u)==before[u] for u in others))
    # 2. Skip leaves everything as it is
    stub_check(pg,'all'); before=snap()
    use(pg,src,d,1)
    try:
        pg.locator(MODAL).wait_for(timeout=60000); pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(1500)
        check('2 Skip changes nothing in the other units', pg.locator(MODAL).count()==0 and all(unit_text(pg,u)==before[u] for u in others))
    except Exception as e: check('2 Skip changes nothing in the other units', False, str(e)[:80])
    # 2b. only some parts no longer fit: every sharing unit is listed, the flagged ones ticked, the others unticked and marked as fitting
    if len(others)>=2:
        stub_check(pg,'mixed'); before=snap()
        asked=use_until_asked(pg,src,d)
        try:
            pg.locator(MODAL).wait_for(timeout=30000 if asked else 1000); pg.wait_for_timeout(1500)
            items=pg.locator('.propagation-item'); n=items.count()
            ticked=[items.nth(i).locator('input[type=checkbox]').is_checked() for i in range(n)]
            check('2b every sharing unit is listed; only the one that no longer fits is ticked', n==len(others) and sum(ticked)==1 and ticked[0], f'items={n} ticked={ticked}')
            pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(800)
        except Exception as e: check('2b every sharing unit is listed; only the one that no longer fits is ticked', False, str(e)[:80])
    # 3. the check says "all fit": no window, others untouched
    stub_check(pg,'none'); before=snap(); CALLS.clear()
    use(pg,src,d,2); pg.wait_for_timeout(8000)
    check('3 when every other part still fits there is no window and nothing changes', pg.locator(MODAL).count()==0 and all(unit_text(pg,u)==before[u] for u in others))
    check('3b the notice says they already fit (when the check was asked)', (not CALLS) or 'already fit' in pg.locator('.intentCards').inner_text(), f'asked={len(CALLS)}')
    # 4. the check fails: every unit that shares the intent is offered
    stub_check(pg,'fail'); before=snap()
    use(pg,src,d,0)
    try:
        pg.locator(MODAL).wait_for(timeout=60000)
        check('4 when the check fails every sharing unit is offered', pg.locator('.propagation-item').count()>=len(others))
        pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(800)
    except Exception as e: check('4 when the check fails every sharing unit is offered', False, str(e)[:80])
    check('no page errors, no 4xx/5xx', not errs and not bad, f'{errs[:2]} {bad[:3]}')
    print(f'RESULT {sum(R)} / {len(R)}')
