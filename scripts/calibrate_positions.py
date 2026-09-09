"""Fit positional multipliers with fixed power exponents to cumulative round counts.

History stays local. This compares demand counts with the CURRENT ESPN player pool,
not historical per-player ADP. Use: python3 scripts/calibrate_positions.py HISTORY.json
"""
import argparse
import json
import math
from pathlib import Path

def fit(history, players, rounds=9, teams=12, rank_weight=0.25,
        exponent_d=1, exponent_g=1.235, pivot=50):
    target=[tuple(sum(p['group']==g and p['pick']<=r*teams for p in history) for g in ('D','G')) for r in range(1,rounds+1)]
    pool=[(p['id'],'G' if p['pos']=='G' else 'D' if p['pos']=='D' else 'F',
           p['adp']**(1-rank_weight)*p['rank']**rank_weight if p.get('rank') else p['adp'])
          for p in players if p.get('pos') and p.get('adp')]
    best=None
    for di in range(50,151):
        for gi in range(50,151):
            d,g=di/100,gi/100
            def adjusted(p):
                multiplier, exponent=(d,exponent_d) if p[1]=='D' else (g,exponent_g) if p[1]=='G' else (1,1)
                return p[2]*multiplier*(p[2]/pivot)**(exponent-1)
            ordered=sorted(pool,key=lambda p:(adjusted(p),p[0]))[:rounds*teams]
            counts=[];nd=ng=0
            for i,p in enumerate(ordered,1):
                nd+=p[1]=='D';ng+=p[1]=='G'
                if i%teams==0:counts.append((nd,ng))
            error=sum((x-a)**2+(y-b)**2 for (x,y),(a,b) in zip(counts,target))
            key=(error,math.log(d)**2+math.log(g)**2)
            if best is None or key<best[0]:best=(key,d,g,counts)
    return {'rank_weight':rank_weight,'curve_pivot':pivot,'exponentD':exponent_d,'exponentG':exponent_g,
            'multiplierF':1,'multiplierD':best[1],'multiplierG':best[2],
            'squared_count_error':best[0][0],'target_counts':target,'predicted_counts':best[3]}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('history',type=Path)
    parser.add_argument('--espn',type=Path,default=Path(__file__).resolve().parents[1]/'data/processed/espn.json')
    args=parser.parse_args()
    print(json.dumps(fit(json.loads(args.history.read_text()),json.loads(args.espn.read_text())['players']),indent=2))
