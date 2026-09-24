"""Fetch public Yahoo hockey ADP and eligibility; never touches ESPN snapshots."""
import argparse
import datetime
import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2'

def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'fh-manager/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)

def merge(items):
    return {key: value for item in items if isinstance(item, dict) for key, value in item.items()}

def normalize(entry):
    parts = entry['player']
    info = merge(parts[0])
    draft = merge(merge(parts[1:]).get('draft_analysis', []))
    try:
        adp = float(draft.get('average_pick'))
        if not math.isfinite(adp) or adp <= 0:
            adp = None
    except (ValueError, TypeError):
        adp = None
    positions = [p['position'] for p in info.get('eligible_positions', [])
                 if p.get('position') in ('C', 'LW', 'RW', 'D', 'G')]
    return {'id': str(info['player_id']), 'name': info['name']['full'],
            'team': info.get('editorial_team_abbr', ''), 'pos': ','.join(dict.fromkeys(positions)),
            'adp': adp, 'rank': None}

def fetch(season):
    meta = get(BASE + '/game/nhl?format=json')['fantasy_content']['game'][0]
    if int(meta['season']) != season:
        raise ValueError(f'Yahoo returned season {meta["season"]}, expected {season}')
    players, seen, urls = [], set(), []
    for start in range(0, 5000, 25):
        url = f'{BASE}/game/{meta["game_key"]}/players;start={start};count=25/draft_analysis?format=json'
        collection = get(url)['fantasy_content']['game'][1]['players']
        urls.append(url)
        batch = [normalize(v) for k, v in collection.items() if k != 'count']
        if not batch:
            break
        if any(p['id'] in seen for p in batch):
            raise ValueError('Repeated page or duplicate player; existing snapshot preserved')
        players.extend(batch)
        seen.update(p['id'] for p in batch)
        if len(batch) < 25:
            break
        time.sleep(.15)
    else:
        raise ValueError('Pagination limit reached; existing snapshot preserved')
    if len(players) < 500 or sum(p['adp'] is not None for p in players) < 150:
        raise ValueError('Incomplete Yahoo player pool; existing snapshot preserved')
    if not all(p['pos'] for p in players):
        raise ValueError('Missing Yahoo eligibility; existing snapshot preserved')
    return {'season': season, 'gameKey': meta['game_key'],
            'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'url': BASE + f'/game/{meta["game_key"]}/players/draft_analysis?format=json',
            'pages': len(urls), 'rankNote': 'Default draft ranking not supplied; rank is intentionally null.',
            'players': players}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=2026, help='Season start year')
    args = parser.parse_args()
    snapshot = fetch(args.season)
    output = ROOT / 'data/processed/yahoo.json'
    output.write_text(json.dumps(snapshot, indent=2) + '\n')
    print(f'{len(snapshot["players"])} players; {sum(p["adp"] is not None for p in snapshot["players"])} ADPs; {snapshot["pages"]} pages')
