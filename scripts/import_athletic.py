"""Extract cached season totals, not per-game Player Data or source fantasy scores."""
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]

def extract(path):
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    sheet = workbook['The List']
    rows = list(sheet.values)
    assert rows[0][1] == 'NAME' and rows[0][29] == 'PIM' and rows[0][25] == 'SHP'
    result = []
    for row in rows[1:]:
        if not isinstance(row[1], str) or not row[1].strip():
            continue
        name, pos = row[1].strip(), str(row[3]).strip()
        group = 'G' if pos == 'G' else 'D' if 'D' in pos.split(',') else 'F'
        indices = {'GP':35,'W':36,'SO':39,'SV':40,'GA':41} if group == 'G' else {'GP':16,'G':18,'A':19,'SHP':25,'BLK':26,'PIM':29}
        stats = {}
        for stat, index in indices.items():
            value = row[index]
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'{name}: missing cached season total {stat}')
            stats[stat] = value
        result.append({'id':hashlib.sha256(name.encode()).hexdigest()[:16], 'name':name,
                       'team':row[5], 'age':row[6], 'group':group, 'sourcePos':pos, 'stats':stats,
                       'source':'The Athletic', 'weight':1})
    if len({p['id'] for p in result}) != len(result):
        raise ValueError('Duplicate player names; supply an explicit identity mapping')
    workbook.close()
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook', type=Path)
    args = parser.parse_args()
    players = extract(args.workbook)
    for directory in ['data/raw', 'data/processed', 'apps-script']:
        (ROOT / directory).mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.workbook, ROOT / 'data/raw' / args.workbook.name)
    metadata = {'file':args.workbook.name,'sha256':hashlib.sha256(args.workbook.read_bytes()).hexdigest(),
                'sheet':'The List','units':'season totals','players':len(players)}
    (ROOT/'data/processed/athletic.json').write_text(json.dumps({'metadata':metadata,'players':players}, indent=2))
    (ROOT/'apps-script/ProjectionData.gs').write_text('const PROJECTION_DATA = '+json.dumps(players)+';\n')
    print(json.dumps(metadata))
