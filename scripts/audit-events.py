#!/usr/bin/env python3
"""Read-only audit of public event data. Never modifies Supabase records."""
import argparse
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from difflib import SequenceMatcher
import unicodedata

ROOT = Path(__file__).resolve().parents[1]

def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else None

def normal(value):
    value = unicodedata.normalize('NFKD', value or '')
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()

def audit(sources, events, now):
    findings = []
    counts = {}
    for event in events:
        counts[event.get('source_id')] = counts.get(event.get('source_id'), 0) + 1
    for source in sources:
        synced = timestamp(source.get('last_synced_at'))
        hours = (now - synced).total_seconds() / 3600 if synced else None
        if synced is None or hours > 18:
            findings.append({'kind': 'stale_source', 'source': source['key'], 'name': source['name'], 'last_synced_at': source.get('last_synced_at'), 'hours': round(hours, 1) if hours is not None else None})
    outside = re.compile(r'\b(žalec|zalec|šentjur|sentjur|velenje|maribor|ljubljana|laško|lasko|vojnik|dobrna|rogaška slatina|gornja radgona)\b', re.I)
    valid = []
    for event in events:
        reasons = []
        try:
            start = timestamp(event.get('start_at'))
            end = timestamp(event.get('end_at'))
            if not start or (end and end < start): reasons.append('neveljaven datum ali konec pred začetkom')
            if event.get('event_type') in ('ongoing', 'multiday') and not end: reasons.append('večdnevni dogodek brez konca')
            if start: valid.append((start, event))
        except (ValueError, TypeError):
            reasons.append('neveljaven zapis datuma')
        if not (event.get('title') or '').strip(): reasons.append('manjka naslov')
        if not (event.get('venue') or '').strip(): reasons.append('manjka prizorišče')
        venue = event.get('venue') or ''
        address = event.get('address') or ''
        # Avoid treating Ljubljanska/Mariborska cesta and team names as outside locations.
        if outside.search(address) or outside.search(venue): reasons.append('preveri lokacijo zunaj Celja')
        if re.search(r'\b(odpovedan\w*|prestavlj\w*|cancelled|canceled)\b', event.get('title') or '', re.I): reasons.append('naslov omenja odpoved ali prestavitev')
        url = urllib.parse.urlparse(event.get('source_url') or '')
        if url.scheme not in ('https', 'http') or not url.netloc: reasons.append('manjka veljavna izvorna povezava')
        if reasons:
            findings.append({'kind':'event_review', 'id':event['id'], 'title':event.get('title'), 'url':event.get('source_url'), 'reasons':reasons})
    valid.sort(key=lambda row: row[0])
    for index, (start, event) in enumerate(valid):
        for other_start, other in valid[index + 1:]:
            if (other_start - start).total_seconds() > 1800: break
            title = normal(event.get('title'))
            other_title = normal(other.get('title'))
            venue = normal(event.get('venue'))
            other_venue = normal(other.get('venue'))
            if len(title) < 8 or not venue or not other_venue: continue
            if SequenceMatcher(None, title, other_title).ratio() >= .92 and SequenceMatcher(None, venue, other_venue).ratio() >= .85:
                findings.append({'kind':'possible_duplicate', 'ids':[event['id'], other['id']], 'title':event['title'], 'starts':[event['start_at'],other['start_at']], 'venues':[event.get('venue'),other.get('venue')], 'urls':[event.get('source_url'),other.get('source_url')]})
    return {'checked_at':now.isoformat(), 'source_count':len(sources), 'event_count':len(events), 'counts_by_source':{s['key']:counts.get(s['id'],0) for s in sources}, 'findings':findings}

def fetch_rows(base, key, table, params):
    rows = []
    for offset in range(0, 100000, 500):
        query = urllib.parse.urlencode({**params, 'limit':500, 'offset':offset})
        request = urllib.request.Request(f'{base}/rest/v1/{table}?{query}', headers={'apikey':key})
        with urllib.request.urlopen(request, timeout=45) as response:
            batch = json.load(response)
        if not isinstance(batch, list): raise ValueError('Expected a list from the database')
        rows.extend(batch)
        if len(batch) < 500: return rows
    raise RuntimeError('Audit pagination safety limit reached; report is incomplete')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='/tmp/celje-audit.json')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    try:
        config = (ROOT / 'lib/events.js').read_text()
        base = re.search(r'const SUPABASE_URL = "([^"]+)"', config)[1]
        key = re.search(r'const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"', config)[1]
        sources = fetch_rows(base, key, 'sources', {'select':'id,key,name,last_synced_at', 'active':'eq.true', 'order':'id.asc'})
        lower = (now - timedelta(days=1)).isoformat()
        upper = (now + timedelta(days=90)).isoformat()
        events = fetch_rows(base, key, 'events', {'select':'id,source_id,title,start_at,end_at,event_type,venue,address,source_url', 'status':'eq.published', 'duplicate_of':'is.null', 'location_status':'eq.in_area', 'or':f'(start_at.gte.{lower},end_at.gte.{lower})', 'start_at':f'lt.{upper}', 'order':'start_at.asc,id.asc'})
        report = audit(sources, events, now)
    except Exception as error:
        report = {'checked_at':now.isoformat(), 'findings':[{'kind':'audit_failure','message':str(error)}]}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ('findings','counts_by_source')}, ensure_ascii=False))
    print(f"Findings: {len(report['findings'])}; report: {args.output}")
    return 1 if any(f['kind']=='audit_failure' for f in report['findings']) else 0

if __name__ == '__main__':
    raise SystemExit(main())
