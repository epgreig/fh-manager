"""Normalize secondary season projections against Athletic player IDs."""
import csv
import json
import re
import unicodedata
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
ATHLETIC = ROOT / 'data/processed/athletic.json'
WEIGHTS = {'The Athletic':15, 'DtZ':5, 'LineupExperts':5, 'Apples & Ginos Blake':3,
           'Apples & Ginos Nate':3, 'Steve Laidlaw':3, 'Hashtag Hockey':2, 'Scott Cullen':2}

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
    'Matthew Savoie':'Matt Savoie', 'Alexandre Texier':'Alex Texier',
    'Dimitri Voronkov':'Dmitri Voronkov',
    'Mat Barzal':'Mathew Barzal', 'Gabe Vilardi':'Gabriel Vilardi',
    'Matthew Coronato':'Matt Coronato', 'Vasili Podkolzin':'Vasily Podkolzin',
    'Alexander Romanov':'Alex Romanov', 'JJ Moser':'Janis Moser',
    "Zach L'Heureux":"Zachary L'Heureux",
    'John-Jason Peterka':'JJ Peterka', 'Zachary Benson':'Zach Benson',
    'Joshua Norris':'Josh Norris', 'Gabriel Perreault':'Gabe Perreault',
    'Benjamin Kindel':'Ben Kindel', 'Cameron York':'Cam York',
    'Matthew Samoskevich':'Mackie Samoskevich', 'Anthony DeAngelo':'Tony DeAngelo',
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

def lineup_rows(filename):
    for row in rows(filename):
        row['Player'] = re.sub(r'\s+\([^()]+ - [^()]+\)$', '', row['Player']).strip()
        yield row

def apples_rows(filename):
    """The downloadable CSV repeats its headers and includes calculated fantasy columns."""
    with (RAW / filename).open(encoding='utf-8-sig', newline='') as handle:
        sheet = list(csv.reader(handle))
    header = sheet[6]
    if header[:13] != ['Name','Team','Y! Pos','Proj PP','GP','G','A','PTS','PPP','SOG','HIT','BLK','PIM']:
        raise ValueError(f'Unexpected Apples & Ginos columns: {filename}')
    for row in sheet[7:]:
        if len(row) >= 13 and row[0].strip() and number(row[4]) is not None:
            yield dict(zip(header[:13], row[:13]))

def laidlaw_rows(filename):
    """Read season skater totals; goalie tiers have no stat projections."""
    workbook = openpyxl.load_workbook(RAW / filename, read_only=True, data_only=True)
    try:
        sheet = workbook['Skaters']
        if tuple(next(sheet.values)) != (None, 'GP', 'G', 'A', 'P', 'PPP', 'SOG', 'Hits', 'Blks'):
            raise ValueError('Unexpected Steve Laidlaw skater columns')
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if isinstance(row[0], str) and row[0].strip() and number(row[1]) is not None:
                yield dict(zip(('Name','GP','G','A','P','PPP','SOG','Hits','BLK'), row))
    finally:
        workbook.close()

def extract():
    athletic = json.loads(ATHLETIC.read_text())['players']
    names = {}
    for player in athletic:
        normalized = key(player['name'])
        if normalized in names:
            raise ValueError(f'Ambiguous normalized Athletic name: {player["name"]}')
        names[normalized] = player
    output, unmatched = [], {}

    def add(source, data, filename, name_field, goalie=False, reader=rows):
        misses = []
        for row in reader(filename):
            name = (row.get(name_field) or '').strip()
            if not name or name == name_field or number(row.get('GP')) is None:
                continue
            player = names.get(key(ALIASES.get(name, name)))
            if player is None or (player['group'] == 'G') != goalie:
                misses.append(name)
                continue
            stats = {field: number(row.get(column)) for field, column in data.items()}
            stats = {field: value for field, value in stats.items() if value is not None}
            source_weight = WEIGHTS[source]
            output.append({'id': player['id'], 'source': source, 'weight': source_weight, 'stats': stats})
        unmatched[source + ' ' + ('goalies' if goalie else 'skaters')] = misses

    add('Scott Cullen', {'GP':'GP','G':'G','A':'A','BLK':'BLOCKS','PIM':'PIM'},
        'NHL Player Projections 2026-2027 - Position-By-Position Fantasy Rankings.csv','PLAYER')
    add('Scott Cullen', {'GP':'GP','W':'W','SO':'SO'},
        'NHL Player Projections 2026-2027 - Goalies.csv','PLAYER',True)
    add('Hashtag Hockey', {'GP':'GP','G':'GOA','A':'AST','BLK':'BLK','PIM':'PIM','SHP':'SHP'},
        'HashtagHockeySkaters.csv','NAME')
    add('Hashtag Hockey', {'GP':'GP','W':'WIN','SO':'SHU','GA':'GA','SV':'SAV'},
        'HashtagHockeyGoalies.csv','NAME',True)
    for author in ('Blake', 'Nate'):
        add('Apples & Ginos '+author, {'GP':'GP','G':'G','A':'A','BLK':'BLK','PIM':'PIM'},
            f"Apples & Ginos 2026-27 NHL Skater Projections - {author}'s Projections.csv",
            'Name',reader=apples_rows)
    add('Steve Laidlaw', {'GP':'GP','G':'G','A':'A','BLK':'BLK'},
        '2026-27 Steve Laidlaw Fantasy Hockey Rankings.xlsx','Name',reader=laidlaw_rows)
    add('LineupExperts', {'GP':'GP','G':'G','A':'AST','BLK':'BLK','PIM':'PIM'},
        'LineupExperts.csv','Player',reader=lineup_rows)
    add('DtZ', {'GP':'GP','G':'Goals','A':'Assists','BLK':'BLK','PIM':'PIM','SHP':'SHP'},
        'Free Version DtZ 2026-2027 NHL Fantasy Projections - Skater Projections.csv','Player')
    add('DtZ', {'GP':'GP','W':'W','SO':'SO','GA':'GA','SV':'SV'},
        'Free Version DtZ 2026-2027 NHL Fantasy Projections - Goalie Projections.csv','Player',True)
    identity = [(p['id'],p['source']) for p in output]
    if len(identity) != len(set(identity)):
        raise ValueError('Duplicate player/source pairs in secondary projections')
    return output, unmatched

if __name__ == '__main__':
    projections, unmatched = extract()
    (ROOT/'apps-script/SecondaryProjectionData.gs').write_text('const SECONDARY_PROJECTION_DATA = '+json.dumps(projections, separators=(',',':'))+';\n')
    (ROOT/'data/processed/secondary-projections.json').write_text(json.dumps({'players':projections,'unmatched':unmatched},indent=2))
    print(json.dumps({'rows':len(projections),'by_source':{s:sum(p['source']==s for p in projections) for s in WEIGHTS if s!='The Athletic'},'unmatched':{s:len(v) for s,v in unmatched.items()}},indent=2))
