import os
import sys,json,re
sys.path.insert(0,'/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad')
from hira import *
from concurrent.futures import ThreadPoolExecutor
B='/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad/'
b=json.load(open(B+'basis.json'));seoul=json.load(open(B+'nps/seoul.json'))
meta={f"s-{t}-{k+1}":r for t in seoul for k,r in enumerate(seoul[t])}
norm=lambda s:re.sub(r'\s|\(.*?\)','',s)
def retry(i):
    r=meta[i];base=norm(re.sub(r'^(의료법인|재단법인|사단법인)[:：]?','',r['n']))
    qs=[base,re.sub(r'(의원|병원)$','',base),re.sub(r'(서울점|화곡점|점)$','',base)]
    for q in dict.fromkeys(qs):
        if len(q)<3: continue
        its=items(call('hospInfoServicev2/getHospBasisList',sidoCd=110000,yadmNm=q,numOfRows=20)) or []
        cand=[x for x in its if x.get('sgguCdNm')==r['gu']]
        if cand and len(its)<20:
            x=cand[0];return i,{**{k:x.get(k) for k in ['ykiho','yadmNm','clCd','clCdNm','drTotCnt','mdeptSdrCnt','mdeptGdrCnt','estbDd','addr','sgguCdNm','hospUrl']},'exact':False,'ncand':len(its)}
    return i,{'nomatch':True}
bad=[i for i,v in b.items() if 'err' in v or v.get('nomatch') or (v.get('ncand',0)>=20 and not v.get('exact')) or '살림' in str(v.get('yadmNm'))]
with ThreadPoolExecutor(10) as ex:
    for i,v in ex.map(retry,bad): b[i]=v
json.dump(b,open(B+'basis2.json','w'),ensure_ascii=False)
print('retry done',sum(1 for i in bad if b[i].get('ykiho')),'/',len(bad),flush=True)
def spc(i):
    its=items(call('MadmDtlInfoService2.8/getSpcSbjtSdrInfo2.8',ykiho=b[i]['ykiho'],numOfRows=50))
    return i,its
ids=[i for i,v in b.items() if v.get('ykiho')]
sp={}
with ThreadPoolExecutor(10) as ex:
    for i,its in ex.map(spc,ids): sp[i]=its
json.dump(sp,open(B+'spc.json','w'),ensure_ascii=False)
print('spc done',sum(1 for v in sp.values() if v is not None),len(ids),flush=True)
