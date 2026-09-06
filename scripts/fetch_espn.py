"""Fetch ESPN's public current-season fantasy draft pool and build a Sheets snapshot."""
import argparse
import datetime
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLOTS = {0:'C',1:'LW',2:'RW',4:'D',5:'G'}

def normalize(payload):
    players = []
    for entry in payload['players']:
        p = entry.get('player', entry)
        adp = p.get('ownership', {}).get('averageDraftPosition')
        rank = p.get('draftRanksByRankType', {}).get('STANDARD', {}).get('rank')
        players.append({'id':str(p['id']), 'name':p['fullName'],
                        'pos':','.join(SLOTS[s] for s in sorted(set(p['eligibleSlots'])) if s in SLOTS),
                        'adp':adp if isinstance(adp,(int,float)) and adp>0 else None,
                        'rank':rank if isinstance(rank,(int,float)) and rank>0 else None})
    if not players or not any(p['adp'] for p in players):
        raise ValueError('No ESPN ADP returned; existing snapshot preserved')
    return players

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--season',type=int,default=2027)
    parser.add_argument('--input',type=Path,help='Previously downloaded response from the same endpoint')
    args=parser.parse_args()
    url=f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/{args.season}/segments/0/leaguedefaults/1?view=kona_player_info'
    filters={'players':{'limit':2000,'offset':0,'filterStatsForExternalIds':{'value':[args.season]},'sortDraftRanks':{'sortPriority':1,'sortAsc':True,'value':'STANDARD'}}}
    if args.input:
        payload=json.loads(args.input.read_text())
    else:
        request=urllib.request.Request(url,headers={'X-Fantasy-Filter':json.dumps(filters)})
        with urllib.request.urlopen(request,timeout=60) as response:
            payload=json.load(response)
    players=normalize(payload)
    if len(players)>=2000:raise ValueError('Player limit reached; add pagination before publishing')
    snapshot={'season':args.season,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':url,'players':players}
    (ROOT/'data/processed/espn.json').write_text(json.dumps(snapshot,indent=2)+'\n')
    (ROOT/'apps-script/EspnData.gs').write_text('const ESPN_DATA = '+json.dumps(snapshot)+';\n')
    print(f'{len(players)} ESPN players; {sum(p["adp"] is not None for p in players)} positive ADPs')
