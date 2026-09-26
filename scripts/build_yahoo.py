"""Build an independent Yahoo deployment from shared code, never deploy ESPN."""
import hashlib
import csv
import json
import shutil
from pathlib import Path
from import_athletic import extract as athletic_extract
from import_secondary import extract as secondary_extract, key, ALIASES, WEIGHTS

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'build/yahoo'
YAHOO_ALIASES = {**ALIASES, 'Will Borgen':'William Borgen', 'Freddy Gaudreau':'Frederick Gaudreau',
                 'Alexey Toropchenko':'Alexei Toropchenko', 'Alexander Holtz':'Alex Holtz', 'Joseph Veleno':'Joe Veleno'}

def build():
    config = json.loads((ROOT/'leagues/yahoo.json').read_text())
    athletic = athletic_extract(ROOT/'data/raw/2026-27-Fantasy-Projections-Yahoo.xlsx', extended=True)
    # Reviewed source typo: the unqualified name is the forward; (D) is distinct.
    for p in athletic:
        if p['name']=='Elias Pettersson':
            p['group']='F';p['sourcePos']='C'
    secondary, unmatched = secondary_extract(extended=True)
    for p in athletic+secondary:
        p['weight'] = config['defaults'][config['projectionWeightSettings'][p['source']]]
    snapshot = json.loads((ROOT/'data/processed/yahoo.json').read_text())
    rank_rows = list(csv.reader((ROOT/'data/raw/Yahoo Ranks.csv').open(newline='', encoding='utf-8-sig')))
    if rank_rows[1][:2] != ['Player', 'Rank']:
        raise ValueError('Unexpected Yahoo ranks CSV headers')
    ranks = {}
    for player in snapshot['players']:
        player['rank'] = None
    for row in rank_rows[2:]:
        if not row or not row[0].strip(): continue
        lines = [line.strip() for line in row[0].splitlines() if line.strip()]
        name = lines[0].strip()
        identity = next((line for line in lines[1:] if ' - ' in line), None)
        if identity is None:
            raise ValueError('Yahoo rank is missing team/position identity: '+row[0])
        team, positions = identity.rsplit(' - ', 1)
        normalized = key(YAHOO_ALIASES.get(name, name))
        candidates = [p for p in snapshot['players']
                      if key(YAHOO_ALIASES.get(p['name'], p['name'])) == normalized
                      and p['team'] == team.strip()
                      and set(p['pos'].split(',')) & set(positions.split(','))]
        if len(candidates) != 1:
            raise ValueError('Ambiguous or unmatched Yahoo rank identity: '+row[0])
        player = candidates[0]
        rank = int(row[1])
        if rank <= 0 or player['id'] in ranks:
            raise ValueError('Invalid or duplicate Yahoo rank: '+name)
        ranks[player['id']] = rank
        player['rank'] = rank
    snapshot['rankNote'] = 'User-provided Yahoo XRank from data/raw/Yahoo Ranks.csv; missing ranks remain blank.'
    snapshot['rankCount'] = len(ranks)
    index = {}
    for p in snapshot['players']:
        index.setdefault(key(YAHOO_ALIASES.get(p['name'], p['name'])), []).append(p)
    matches, missing = [], []
    for p in athletic:
        name = p['name'].replace(' (G)', '').replace(' (D)', '')
        candidates = index.get(key(ALIASES.get(name, name)), [])
        candidates = [x for x in candidates if ('G' in x['pos'].split(',')) == (p['group']=='G')
                      and ('D' in x['pos'].split(',')) == (p['group']=='D')]
        if len(candidates)!=1:
            missing.append({'id':p['id'],'name':p['name'],'group':p['group']})
        else:
            match = candidates[0]
            matches.append({**match,'id':p['id'],'yahooId':match['id']})
    if len(matches) < .95*len(athletic):
        raise ValueError(f'Too many unmatched Yahoo players: {len(missing)}')
    data={k:v for k,v in snapshot.items() if k!='players'}
    data['matches']=matches
    data['domRevision']=hashlib.sha256((ROOT/'data/raw/2026-27-Fantasy-Projections-Yahoo.xlsx').read_bytes()).hexdigest()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    allowed={'Code','Engine','Live','Pan','Names','Compare','Adjustments','DraftRanks','Yahoo'}
    # Do not carry unexpected scripts from an earlier build into a deployable folder.
    unexpected=[p.name for p in OUTPUT.glob('*.gs') if p.stem not in allowed|{'LeagueConfig','ProjectionData','SecondaryProjectionData','YahooData'}]
    if unexpected:raise ValueError(f'Unexpected build files: {unexpected}')
    for name in allowed:
        shutil.copy2(ROOT/f'apps-script/{name}.gs',OUTPUT/f'{name}.gs')
    shutil.copy2(ROOT/'apps-script/appsscript.json',OUTPUT/'appsscript.json')
    (OUTPUT/'LeagueConfig.gs').write_text('function leagueProfile_() {return '+json.dumps(config,separators=(',',':'))+';}\n')
    for name,variable,value in [('ProjectionData','PROJECTION_DATA',athletic),
                                ('SecondaryProjectionData','SECONDARY_PROJECTION_DATA',secondary),('YahooData','YAHOO_DATA',data)]:
        (OUTPUT/f'{name}.gs').write_text(f'const {variable} = '+json.dumps(value,separators=(',',':'))+';\n')
    report={'athletic':len(athletic),'secondary':len(secondary),'yahooMatched':len(matches),'yahooUnmatched':missing,
            'yahooRankCount':len(ranks),'projectedPlayersWithRank':sum(p['rank'] is not None for p in matches),'sourceUnmatched':unmatched,'yahooRetrievedAt':snapshot['retrievedAt'],
            'coverage':{source:{stat:sum(stat in p['stats'] for p in athletic+secondary if p['source']==source)
                        for stat in config['extraStats']} for source in WEIGHTS}}
    (ROOT/'data/processed/yahoo-build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Yahoo build: {len(athletic)} players, {len(secondary)} source rows, {len(matches)} Yahoo matches; report in data/processed/yahoo-build-report.json')

if __name__=='__main__':build()
