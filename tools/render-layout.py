#!/usr/bin/env python3
"""Render a saved, read-only Screeps layout proposal as a reviewable map."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('snapshot');parser.add_argument('output');parser.add_argument('--terrain',required=True)
args=parser.parse_args()
snapshot=json.loads(Path(args.snapshot).read_text());terrain=json.loads(Path(args.terrain).read_text())['terrain']
record=snapshot['colony'];plan=record.get('perimeterProposal') or record['perimeter'];mature=record.get('mature',{})
objects=snapshot['objects'];existing={(o['x'],o['y']):o for o in objects if o['type'] not in ['creep','energy','constructionSite']}
scale=14;ox=30;oy=90
canvas=Image.new('RGB',(1110,835),'#f8fafc');draw=ImageDraw.Draw(canvas)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(size): return ImageFont.truetype(fontpath,size)
def box(x,y,inset=0):return (ox+x*scale+inset,oy+y*scale+inset,ox+(x+1)*scale-inset-1,oy+(y+1)*scale-inset-1)
def label(x,y,text,color='#ffffff'):draw.text((ox+x*scale+3,oy+y*scale+1),text,font=font(9),fill=color)
inside=set(plan['inside']);building_area=set(mature.get('buildingArea',[]))
for y,row in enumerate(terrain):
 for x,v in enumerate(row):
  color='#374151' if int(v)&1 else '#e0ebd4' if int(v)&2 else '#d4ecd8' if y*50+x in building_area else '#fff0ca' if y*50+x in inside else '#f1f5f9'
  draw.rectangle(box(x,y),fill=color)
for p in plan.get('routes',[]):
 x=ox+p['x']*scale+scale//2;y=oy+p['y']*scale+scale//2;draw.ellipse((x-1,y-1,x+1,y+1),fill='#7fb4c8')
labels={'spawn':'S','storage':'B','tower':'T','link':'L','lab':'R','terminal':'M','observer':'O','powerSpawn':'P','nuker':'N','factory':'F','extractor':'X'}
inputs={(p['x'],p['y']) for p in mature.get('labInputs',[])}
for p in mature.get('buildings',[]):
 x,y=p['x'],p['y'];old=existing.get((x,y),{}).get('type')==p['type'];lab=p['type']=='lab'
 color='#7c3aed' if lab else '#111827' if old else '#64748b'
 if p['type']=='extension':draw.ellipse(box(x,y,4),fill=color if old else None,outline=color,width=1)
 else:
  draw.rectangle(box(x,y,2),fill=color if old or lab else '#f8fafc',outline=color,width=1)
  label(x,y,'I' if (x,y) in inputs else labels.get(p['type'],'?'),'#ffffff' if old or lab else color)
for o in objects:
 if o['type'] in ['source','controller','mineral']:
  color={'source':'#eab308','controller':'#f97316','mineral':'#06b6d4'}[o['type']]
  draw.ellipse(box(o['x'],o['y'],2),fill=color,outline='#111827');label(o['x'],o['y'],{'source':'s','controller':'C','mineral':'m'}[o['type']],'#111827')
for p in plan['tiles']:draw.rectangle(box(p['x'],p['y'],1),fill='#16a34a' if p['type']=='rampart' else '#1e3a8a')
for p in plan.get('legacyWalls',[]):
 x,y=p['x'],p['y'];draw.rectangle(box(x,y,2),outline='#dc2626',width=2)
 a,b,c,d=box(x,y,3);draw.line((a,b,c,d),fill='#dc2626',width=1)
for i in range(0,50,5):
 draw.text((ox+i*scale+1,oy-19),str(i),font=font(10),fill='#475569');draw.text((8,oy+i*scale+2),str(i),font=font(10),fill='#475569')
draw.text((30,18),f"{snapshot['room']} — proposed full-room layout",font=font(25),fill='#0f172a')
draw.text((30,53),'Revised footprint: buildings stay inside the perimeter with reserved clearance.',font=font(14),fill='#475569')
x=755;y=90

def text(line,size=14,color='#334155',gap=23):
 global y
 draw.text((x,y),line,font=font(size),fill=color);y+=gap

def heading(line):
 global y
 y+=12;text(line,18,'#0f172a',30)

heading('Protected space')
text(f"{len(plan['inside'])} protected tiles")
text(f"{len(mature.get('buildings',[]))} reserved building positions")
text('Buildings: 3+ tiles from barriers',12, gap=19)
text('Buildings: 5+ tiles from room edges',12, gap=19)
old=record.get('perimeter')
if old and old.get('version')==1:text(f"Current enclosure: {len(old['inside'])} tiles")
heading('Perimeter')
walls=sum(p['type']=='constructedWall' for p in plan['tiles']);ramps=plan['gates']
text(f'{walls} walls + {ramps} rampart passages')
text(f'{plan["cutSize"]} total barrier tiles')
text(f'Rampart upkeep: {ramps*0.03:.2f} energy/tick')
heading('RCL 8 capacity reserved')
text('60 extensions · 10 labs · 3 spawns')
text('6 towers · 6 links · storage · terminal')
text('Factory · observer · power spawn')
text('Nuker · mineral extractor')
text('I = input lab; R = reaction lab',12)
heading('Map key')
for color,description in [('#fff0ca','Interior clearance buffer'),('#1e3a8a','Proposed wall'),('#16a34a','Rampart passage'),('#dc2626','Old interior wall to retire'),('#7c3aed','Future lab group'),('#111827','Existing structure'),('#64748b','Other future structure'),('#7fb4c8','Reserved travel route')]:
 draw.rectangle((x,y+2,x+12,y+14),fill=color);draw.text((x+22,y),description,font=font(13),fill='#334155');y+=20
heading('Approved wall replacement')
text(f"{len(plan.get('legacyWalls',[]))} old interior walls to retire")
conversions=[p for p in plan['tiles'] if p['type']=='rampart' and existing.get((p['x'],p['y']),{}).get('type')=='constructedWall']
text(f'{len(conversions)} existing walls become passages')
draw.text((30,805),f"Snapshot tick {snapshot['gameTime']} · Future reservations are not construction sites.",font=font(12),fill='#475569')
Path(args.output).parent.mkdir(parents=True,exist_ok=True);canvas.save(args.output)
print(args.output)
