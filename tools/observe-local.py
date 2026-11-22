#!/usr/bin/env python3
"""Read-only local Screeps CLI snapshot; never mutates world, memory, or code.

Usage: python3 tools/observe-local.py --room ROOM [--port 21026]
The localhost CLI must be enabled. The report identifies the account via its home spawn.
"""

import argparse
import json
import re
import socket
from urllib.parse import unquote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--room', required=True)
parser.add_argument('--port', type=int, default=21026)
args = parser.parse_args()
if not re.fullmatch(r'[WE]\d+[NS]\d+', args.room):
    parser.error('room must be a Screeps room name')

command = r'''
(async()=>{
  const objects=await storage.db['rooms.objects'].find({room:ROOM});
  const spawn=objects.find(o=>o.type==='spawn' && o.user);
  if(!spawn) throw new Error('No owned spawn found in the requested room');
  const raw=await storage.env.get(storage.env.keys.MEMORY+spawn.user);
  const memory=JSON.parse(raw||'{}'), bot=memory.enclave;
  const code=await storage.db['users.code'].find({user:spawn.user,activeWorld:true});
  const accountCreeps=await storage.db['rooms.objects'].find({type:'creep',user:spawn.user});
  const user=await storage.db.users.findOne({_id:spawn.user});
  const gameTime=await storage.env.get(storage.env.keys.GAMETIME);
  const samples=bot ? bot.samples.map(s=>s.cpu).sort((a,b)=>a-b) : [];
  const report={
    gameTime, room:ROOM, profile:{assignedCpu:user.cpu,gclProgress:user.gcl},
    code:code.map(c=>({branch:c.branch,modules:Object.keys(c.modules||{}).map(k=>k.replace(/\$DOT\$/g,'.')).sort()})),
    territory:bot && {version:bot.version,home:bot.home,block:bot.block},
    colony:bot && bot.colonies[ROOM], alerts:bot && bot.alerts,
    intel:bot && bot.intel,
    travelers:accountCreeps.filter(c=>memory.creeps && memory.creeps[c.name] && ['scout','remoteMiner','remoteHauler','reserver'].includes(memory.creeps[c.name].role)).map(c=>({
      name:c.name,room:c.room,x:c.x,y:c.y,ttl:c.ageTime && c.ageTime-gameTime,spawning:c.spawning,fatigue:c.fatigue,store:c.store,memory:memory.creeps[c.name]})),
    cpu:samples.length ? {samples:samples.length,average:samples.reduce((a,b)=>a+b,0)/samples.length,
      p95:samples[Math.ceil(samples.length*0.95)-1],peak:samples[samples.length-1],
      bucket:bot.samples[bot.samples.length-1].bucket} : null,
    objects:objects.filter(o=>['source','mineral','spawn','controller','creep','constructionSite','energy','container','tower','extension','road','rampart','constructedWall','storage','link','lab','terminal','observer','powerSpawn','nuker','factory','extractor'].includes(o.type)).map(o=>{
      const cm=memory.creeps && memory.creeps[o.name];
      return {type:o.type,id:o._id,name:o.name,mineralType:o.mineralType,level:o.level,progress:o.progress,progressTotal:o.progressTotal,structureType:o.structureType,spawning:o.spawning,
        hits:o.hits,hitsMax:o.hitsMax,isPublic:o.isPublic,cooldown:o.cooldown,decay:o.nextDecayTime && o.nextDecayTime-gameTime,
        store:o.store,storeCapacity:o.storeCapacity,storeCapacityResource:o.storeCapacityResource,energy:o.energy,energyCapacity:o.energyCapacity,regen:o.nextRegenerationTime && o.nextRegenerationTime-gameTime,
        ttl:o.ageTime && o.ageTime-gameTime,body:o.body && o.body.reduce((counts,p)=>{if(p.hits>0)counts[p.type]=(counts[p.type]||0)+1;return counts;},{}),
        x:o.x,y:o.y,fatigue:o.fatigue,task:cm && {role:cm.role,lastMove:cm.lastMove,moveReason:cm.moveReason,moveGoal:cm.moveGoal,yieldUntil:cm.yieldUntil,destination:cm._move && cm._move.dest,workTarget:cm.workTarget,motion:cm.motion,sourceId:cm.sourceId,miningSpot:cm.miningSpot,working:cm.working,task:cm.task,lastAction:cm.lastAction}};
    })
  };
  const encoded=encodeURIComponent(JSON.stringify(report)).replace(/'/g,'%27');
  const total=Math.ceil(encoded.length/1500);
  for(let i=0;i<total;i++)print('ENCLAVE_CHUNK '+i+' '+total+' '+encoded.slice(i*1500,(i+1)*1500));
})().catch(error=>print('ENCLAVE_ERROR '+error.message))
'''.replace('ROOM', json.dumps(args.room))

# Send a single expression to the line-oriented CLI. Data is printed as one JSON line.
command = ' '.join(line.strip() for line in command.splitlines())
with socket.create_connection(('127.0.0.1', args.port), timeout=5) as connection:
    connection.settimeout(5)
    connection.recv(8192)
    connection.sendall((command + '\n').encode())
    received = ''
    while True:
        chunk = connection.recv(65536)
        if not chunk:
            raise SystemExit('CLI closed without a snapshot')
        received += chunk.decode()
        # Chunking avoids the CLI's string-print truncation as the workforce grows.
        chunks = re.findall(r"ENCLAVE_CHUNK (\d+) (\d+) ([^\s'\"]+)[\r\n'\"]", received)
        if chunks:
            total = int(chunks[0][1])
            parts = {int(index): text for index, _, text in chunks}
            if len(parts) == total:
                report = json.loads(unquote(''.join(parts[i] for i in range(total))))
                print(json.dumps(report, indent=2))
                break
        error = received.find('ENCLAVE_ERROR ')
        if error >= 0:
            raise SystemExit(received[error:].strip())
