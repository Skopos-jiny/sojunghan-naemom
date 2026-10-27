import os
import json,subprocess,time,urllib.parse,sys
K=os.environ['HIRA_SERVICE_KEY']
def call(path,**p):
    p.update(serviceKey=K,_type='json')
    url="https://apis.data.go.kr/B551182/"+path+"?"+urllib.parse.urlencode(p)
    for i in range(3):
        r=subprocess.run(["curl","-sS","--max-time","35",url],capture_output=True)
        out=r.stdout.decode('utf-8','ignore')
        if out.strip():
            try: return json.loads(out)
            except Exception: return out
        time.sleep(2+i*2)
    return None
def items(j):
    try:
        it=j['response']['body']['items']
        if not it: return []
        it=it['item']; return it if isinstance(it,list) else [it]
    except Exception: return None
