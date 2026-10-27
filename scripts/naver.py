import os
import json,re,html,subprocess,urllib.parse,time,sys
from concurrent.futures import ThreadPoolExecutor
B='/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad/'
ID,SEC=(os.environ['NAVER_HUB_CLIENT_ID'],os.environ['NAVER_HUB_CLIENT_SECRET'])
def q(kind,query,n=30):
    url=f"https://naverapihub.apigw.ntruss.com/search/v1/{kind}?"+urllib.parse.urlencode({'query':query,'display':n,'sort':'sim'})
    for i in range(3):
        r=subprocess.run(["curl","-sS","--max-time","30",url,"-H","X-NCP-APIGW-API-KEY-ID: "+ID,"-H","X-NCP-APIGW-API-KEY: "+SEC],capture_output=True).stdout.decode('utf-8','ignore')
        try:
            j=json.loads(r)
            if 'items' in j: return j['items']
        except Exception: pass
        time.sleep(1+i)
    return None
seoul=json.load(open(B+'nps/seoul.json'));H=json.load(open(B+'hira_merged.json'))['h']
hosp=[]
for t in seoul:
    for k,r in enumerate(seoul[t]):
        i=f"s-{t}-{k+1}";h=H.get(i)
        n=re.sub(r'^(의료법인|재단법인|사단법인)[:：]?','',r['n']);n=re.sub(r'\(.*?\)','',n).replace(' ','')
        names={n}
        if h: names.add(re.sub(r'\(.*?\)','',h['hn']).replace(' ',''))
        names|={re.sub(r'(의원|병원)$','',x) for x in names}
        names={x for x in names if len(x)>=4}
        hosp.append((i,t,sorted(names,key=len,reverse=True)))
KW=['부작용','소송','피해 불만']
NEG=re.compile(r'부작용|불만|소송|피해|재수술|실패|후회|환불|분쟁|과실|배상|고소|민원|최악|비추|사기|불친절|항의|감각\s?저하|신경\s?손상|빛번짐|혼탁|퇴행|탈락|염증|주위염')
LEGAL=re.compile(r'소송|배상|과실|판결|기소|처분|고소|분쟁|수사|벌금|행정처분|면허')
PROMO=re.compile(r'원장|상담실|이벤트|할인|무료\s?검사|협찬|원고료|체험단|제공받|광고|줄이는|예방법|안전한|걱정\s?없|없는\s?(라섹|라식|임플란트)|Q&A|FAQ')
clean=lambda s:html.unescape(re.sub('<[^>]+>','',s or '')).strip()
def run(h):
    i,t,names=h;base=names[0];res={}
    for kind in ['news','blog','cafearticle']:
        for kw in KW:
            its=q(kind,f'"{base}" {kw}')
            for x in its or []:
                ti,de=clean(x.get('title')),clean(x.get('description'))
                txt=(ti+' '+de).replace(' ','')
                if not any(nm in txt for nm in names): continue
                if not NEG.search(ti+de): continue
                if PROMO.search(ti): continue
                bn=x.get('bloggername','')+x.get('cafename','')
                if any(nm[:4] in bn.replace(' ','') for nm in names) or re.search(r'안과|치과|의원|병원|클리닉',bn): continue
                link=x.get('originallink') or x.get('link')
                if kind=='news' and not LEGAL.search(ti+de): continue
                d=x.get('postdate') or ''
                if d: d=f"{d[:4]}-{d[4:6]}-{d[6:]}"
                elif x.get('pubDate'):
                    try: d=time.strftime('%Y-%m-%d',time.strptime(x['pubDate'][5:16],'%d %b %Y'))
                    except Exception: d=''
                res[link]={'src':{'news':'news','blog':'blog','cafearticle':'cafe'}[kind],'title':ti,'url':link,'date':d,'snippet':de[:120],'author':x.get('bloggername') or x.get('cafename') or ''}
    return i,list(res.values())
out={}
with ThreadPoolExecutor(8) as ex:
    for k,(i,v) in enumerate(ex.map(run,hosp)):
        out[i]=v
        if k%25==0: print(k,flush=True)
json.dump(out,open(B+'ext_raw.json','w'),ensure_ascii=False)
print('done',sum(len(v) for v in out.values()),sum(1 for v in out.values() if v))
