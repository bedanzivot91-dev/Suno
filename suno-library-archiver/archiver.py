#!/usr/bin/env python3
"""Offline Suno library archiver for officially exported audio."""
import argparse
import csv
import hashlib
import html
import json
import os
import re
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path

EXTS={'.mp3','.wav','.flac','.m4a','.aac','.ogg','.mp4','.mid','.midi'}

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def safe_name(name):
    name=re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_',name).strip(' .')
    return (name[:150] or 'untitled')

def init(dest):
    dest.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(dest/'catalog.sqlite3')
    db.execute('''CREATE TABLE IF NOT EXISTS tracks (hash TEXT PRIMARY KEY, filename TEXT NOT NULL,
        source TEXT NOT NULL, bytes INTEGER NOT NULL, imported_utc TEXT NOT NULL)''')
    db.commit();return db

def import_file(path,dest,db,source):
    if path.suffix.lower() not in EXTS: return 'ignored'
    sha=digest(path)
    if db.execute('SELECT 1 FROM tracks WHERE hash=?',(sha,)).fetchone():return 'duplicate'
    folder=dest/'audio';folder.mkdir(exist_ok=True)
    target=folder/(sha[:12]+'_'+safe_name(path.stem)+path.suffix.lower())
    if not target.exists(): shutil.copy2(path,target)
    db.execute('INSERT INTO tracks VALUES (?,?,?,?,?)',(sha,str(target.relative_to(dest)),source,path.stat().st_size,datetime.now(timezone.utc).isoformat()))
    db.commit();return 'imported'

def ingest(paths,dest,db):
    counts={'imported':0,'duplicate':0,'ignored':0,'unsafe':0}
    for input_path in paths:
        p=Path(input_path).expanduser().resolve()
        if not p.exists():print(f'NOT FOUND: {p}');continue
        candidates=sorted(p.rglob('*')) if p.is_dir() else [p]
        for file in candidates:
            if not file.is_file():continue
            if file.suffix.lower()=='.zip':
                with zipfile.ZipFile(file) as z:
                    for item in z.infolist():
                        if item.is_dir():continue
                        name=Path(item.filename)
                        if name.is_absolute() or '..' in name.parts or name.suffix.lower() not in EXTS:
                            counts['unsafe' if name.is_absolute() or '..' in name.parts else 'ignored']+=1;continue
                        if item.file_size>1024*1024*1024*2:
                            counts['unsafe']+=1;continue
                        temp=dest/('.staging_'+str(os.getpid())+'_'+safe_name(name.name))
                        try:
                            with z.open(item) as src,open(temp,'wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
                            counts[import_file(temp,dest,db,f'{file.name}::{item.filename}')]+=1
                        finally:temp.unlink(missing_ok=True)
            else:counts[import_file(file,dest,db,str(file))]+=1
    print(json.dumps(counts,indent=2))

def export(dest,db):
    rows=db.execute('SELECT hash,filename,source,bytes,imported_utc FROM tracks ORDER BY filename').fetchall()
    with open(dest/'catalog.csv','w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f);w.writerow(['sha256','file','source','bytes','imported_utc']);w.writerows(rows)
    items='\n'.join(f'<tr><td>{html.escape(Path(r[1]).name)}</td><td>{r[3]/1024/1024:.1f} MB</td><td>{html.escape(r[2])}</td><td><a href="{html.escape(r[1])}">Open</a></td></tr>' for r in rows)
    doc='''<!doctype html><html lang="sr"><meta charset="utf-8"><title>Suno arhiva</title><style>body{font:16px system-ui;background:#10141b;color:#edf2ff;max-width:1150px;margin:40px auto;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #38404d;text-align:left}a{color:#7bc7ff}</style><h1>Moja Suno arhiva</h1><p>Ukupno: NUM pesama/fajlova. Katalog je lokalni; ništa nije poslato na internet.</p><table><tr><th>Fajl</th><th>Veličina</th><th>Originalni izvor</th><th>Otvori</th></tr>ITEMS</table></html>'''
    (dest/'index.html').write_text(doc.replace('NUM',str(len(rows))).replace('ITEMS',items),encoding='utf-8')
    print(f'Catalog: {len(rows)} files → {dest/"catalog.csv"} and {dest/"index.html"}')

def verify(dest,db):
    bad=[]
    for sha,rel in db.execute('SELECT hash,filename FROM tracks'):
        file=dest/rel
        if not file.is_file() or digest(file)!=sha:bad.append(rel)
    print(f'Verification: {"PASS" if not bad else "FAIL"}, corrupted/missing: {len(bad)}')
    for x in bad[:30]:print(' -',x)
    return not bad

def main():
    parser=argparse.ArgumentParser(description='Offline archiving for officially exported Suno songs')
    parser.add_argument('--library',default='my-suno-archive',help='Destination folder')
    sub=parser.add_subparsers(dest='command',required=True)
    a=sub.add_parser('import',help='Import Suno ZIP files, audio files, or folders');a.add_argument('paths',nargs='+')
    sub.add_parser('report',help='Build CSV + local HTML file')
    sub.add_parser('verify',help='Check archived files using SHA-256')
    args=parser.parse_args();dest=Path(args.library).expanduser().resolve();db=init(dest)
    try:
        if args.command=='import':ingest(args.paths,dest,db);export(dest,db)
        elif args.command=='report':export(dest,db)
        elif args.command=='verify':raise SystemExit(0 if verify(dest,db) else 1)
    finally:db.close()
if __name__=='__main__':main()
