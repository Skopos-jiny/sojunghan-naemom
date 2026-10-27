import os
import json,re,html,time,sys
sys.path.insert(0,'/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad')
exec(open('/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad/naver.py').read().split("KW=")[0])
from concurrent.futures import ThreadPoolExecutor
clean=lambda s:html.unescape(re.sub('<[^>]+>','',s or '')).strip()
NEGT=re.compile(r'최악|후회|실패|재수술|소송|고소|피해|불만|실망|억울|비추|환불|분쟁|과실|의료사고|부작용\s*(후기|생겼|때문|으로|이\s*생|겪)|망했|항의|불친절|사과|배상')
EXP=re.compile(r'내돈내산|솔직|후기|리뷰|경험|일기|차\s*후기|개월|년차|D\+|받았|했어요|다녀')
PROMO=re.compile(r'원장|상담실|이벤트|할인|협찬|원고료|체험단|제공받|추천|잘하는|TOP|\d+곳|비교|가격|비용|총정리|방법|차이|종류|효과|정보|안내|순위|가이드|소개|선정|오픈|이유')
CITY=re.compile(r'대구|부산|인천|대전|광주|울산|송도|부천|수원|분당|일산|창원|천안|청주|전주|제주|김포|용인|안양|평택|남양주|하남|의정부|고양')
def run(h):
    i,t,names=h;res={}
    for kind in ['blog','cafearticle','news']:
        for kw in ['최악','후회','재수술','소송','실망'] if kind!='news' else ['소송','의료사고']:
            for x in q(kind,f'{names[0]} {kw}') or []:
                ti,de=clean(x.get('title')),clean(x.get('description'))
                if not any(n in ti.replace(' ','') for n in names): continue
                if CITY.search(ti+de) or PROMO.search(ti): continue
                bn=(x.get('bloggername','')+x.get('cafename','')).replace(' ','')
                if re.search(r'안과|치과|의원|병원|클리닉',bn): continue
                neg=bool(NEGT.search(ti)) or bool(NEGT.search(de))
                exp=bool(EXP.search(ti))
                if kind=='news' and not re.search(r'소송|의료사고|배상|과실|판결|기소|처분',ti+de): continue
                if kind!='news' and not (neg or exp): continue
                link=x.get('originallink') or x.get('link');d=x.get('postdate') or ''
                if d: d=f"{d[:4]}-{d[4:6]}-{d[6:]}"
                res[link]={'src':{'news':'news','blog':'blog','cafearticle':'cafe'}[kind],'title':ti,'url':link,'date':d,'snippet':de[:140],'author':x.get('bloggername') or x.get('cafename') or '','neg':neg}
    return i,list(res.values())
out={}
with ThreadPoolExecutor(8) as ex:
    for i,v in ex.map(run,hosp): out[i]=v
json.dump(out,open(B+'ext2.json','w'),ensure_ascii=False)
print('done',sum(len(v) for v in out.values()),sum(1 for v in out.values() for e in v if e['neg']))
