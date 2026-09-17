"""Normalize the owner's Cullen and Hashtag Hockey CSVs against Athletic IDs."""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
ATHLETIC = ROOT / 'data/processed/athletic.json'

# Reviewed spelling variants only; never match on surname alone.
ALIASES = {
    'Matthew Boldy':'Matt Boldy', 'Alexander Ovechkin':'Alex Ovechkin',
    'Alexander Nikishin':'Alex Nikishin', 'Matthew Beniers':'Matty Beniers',
    'Alexis Lafreniere':'Alexis Lafrenière', 'Zack Bolduc':'Zachary Bolduc',
    'Egor Chinakhov':'Yegor Chinakhov', 'Michael Matheson':'Mike Matheson',
    'J.J. Moser':'Janis Moser', 'Alexander Wennberg':'Alex Wennberg',
    'Tommy Novak':'Thomas Novak', 'Jake Middleton':'Jacob Middleton',
    'Alexandre Carrier':'Alex Carrier', 'Alexander Kerfoot':'Alex Kerfoot',
    'Emil Lilleberg':'Emil Martinsen Lilleberg',
    'Ukko-Pekka Luukkinen':'Ukko-Pekka Luukkonen',
    'Daniel Vladar':'Dan Vladar', 'Daniil Tarasov':'Daniil Tarasov (G)',
}

def key(name):
    ascii_name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub('[^a-z0-9]', '', ascii_name.lower())

def number(value):
    if value is None or not str(value).strip():
        return None
    return float(str(value).replace(',', ''))

def rows(filename):
    with (RAW / filename).open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))

def extract():
    athletic = json.loads(ATHLETIC.read_text())['players']
    names = {key(p['name']): p for p in athletic}
    output, unmatched = [], {}

    def add(source, data, filename, name_field, goalie=False):
        misses = []
        for row in rows(filename):
            name = (row.get(name_field) or '').strip()
            if not name or name == name_field or number(row.get('GP')) is None:
                continue
            player = names.get(key(ALIASES.get(name, name)))
            if player is None or (player['group'] == 'G') != goalie:
                misses.append(name)
                continue
            stats = {field: number(row.get(column)) for field, column in data.items()}
            stats = {field: value for field, value in stats.items() if value is not None}
            output.append({'id': player['id'], 'source': source, 'weight': 0.25 if source == 'Hashtag Hockey' else 0.15, 'stats': stats})
        unmatched[source + ' ' + ('goalies' if goalie else 'skaters')] = misses

    add('Scott Cullen', {'GP':'GP','G':'G','A':'A','BLK':'BLOCKS','PIM':'PIM'},
        'NHL Player Projections 2026-2027 - Position-By-Position Fantasy Rankings.csv','PLAYER')
    add('Scott Cullen', {'GP':'GP','W':'W','SO':'SO'},
        'NHL Player Projections 2026-2027 - Goalies.csv','PLAYER',True)
    add('Hashtag Hockey', {'GP':'GP','G':'GOA','A':'AST','BLK':'BLK','PIM':'PIM','SHP':'SHP'},
        'HashtagHockeySkaters.csv','NAME')
    add('Hashtag Hockey', {'GP':'GP','W':'WIN','SO':'SHU','GA':'GA','SV':'SAV'},
        'HashtagHockeyGoalies.csv','NAME',True)
    identity = [(p['id'],p['source']) for p in output]
    if len(identity) != len(set(identity)):
        raise ValueError('Duplicate player/source pairs in secondary projections')
    return output, unmatched

if __name__ == '__main__':
    projections, unmatched = extract()
    (ROOT/'apps-script/SecondaryProjectionData.gs').write_text('const SECONDARY_PROJECTION_DATA = '+json.dumps(projections, separators=(',',':'))+';\n')
    (ROOT/'data/processed/secondary-projections.json').write_text(json.dumps({'players':projections,'unmatched':unmatched},indent=2))
    print(json.dumps({'rows':len(projections),'by_source':{s:sum(p['source']==s for p in projections) for s in ['Scott Cullen','Hashtag Hockey']},'unmatched':{s:len(v) for s,v in unmatched.items()}},indent=2))
