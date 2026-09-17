"""Build the complete importable .mcpack, offline, from original material recipes."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont
from catalog import catalog
from materials import write_surface
from rendering import dump, write_rendering

ROOT=Path(__file__).resolve().parent
VERSION=[1,0,0]
NAME='Wildlight Realism Ultra'
HEADER_UUID='c49f62e7-e52f-4867-a424-92a3aa21f6ef'
MODULE_UUID='21d10dd1-6a3a-489b-9207-45632083d4b9'

INSTALL='''WILDLIGHT REALISM ULTRA 1.0.0
Minecraft Bedrock for Windows - stable 26.50 (internal version 1.26.50).

INSTALL
1. Open Wildlight-Realism-Ultra.mcpack with Minecraft and wait for import success.
2. Edit a world > Resource Packs > My Packs > Wildlight Realism Ultra > Activate.
3. Place Wildlight at the top of the active resource-pack list.
4. Settings > Video > Graphics Mode > Vibrant Visuals.
5. Use Favor Visuals, or raise the available quality settings to suit your GPU.
6. Leave and reopen the world after changing packs.

This pack requires Vibrant Visuals. It is not a Java shader, an RTX pack, or
a RenderDragon patch. The .mcpack is the installable file: no scripts to run.
Global Resources may also work; per-world activation is the clearest setup.

WHAT TO EXPECT
512-pixel original procedural material maps for 248 block texture surfaces,
89 biome bindings, natural daylight, restrained color grading, soft shadows,
28-octave water waves, caustics, biome-specific water, atmospheric haze,
colored local lighting, and deliberately dark nights and unlit caves.
Each material includes color, normal and metalness/emission/roughness/
subsurface maps. Unsupported surfaces, mobs, items and UI retain vanilla art.

QUALITY NOTES
Use torches underground. The very dark appearance is intentional.
The high-resolution maps can use substantial GPU memory; performance depends
on your GPU, screen resolution and render distance. No fixed FPS is promised.
Normal maps add shading relief, not extra block geometry or true displacement.
Vibrant Visuals supplies screen-space reflections; off-screen reflections and
mirror-accurate reflections are limited by the engine.

VALIDATION STATUS
Archive structure, resource links, JSON fields, image channels, biome coverage,
material paths and normal-map integrity are checked by validate.py.
This build has not been launched inside Minecraft: Bedrock. Visual quality,
import behavior and performance still require an in-game check on a supported PC.

If Minecraft reports missing dependencies or an incompatible pack, confirm
your version is 26.50 or newer and Vibrant Visuals is available. If textures
are unchanged, move the pack above other visual packs and reload the world.
For content errors, enable Settings > Creator > Content Log GUI and share
the exact error text or a screenshot for a targeted fix.

Source: https://github.com/cory56626-art/THEBOBSBATH/tree/main/minecraft/wildlight-realism
'''


def icon(path):
    # Geometric brand mark, not an in-game screenshot.
    im=Image.new('RGB',(256,256),(15,27,32));d=ImageDraw.Draw(im)
    for y in range(256):
        t=y/255;d.line((0,y,255,y),fill=(int(19+10*t),int(40+16*t),int(47+14*t)))
    d.ellipse((173,30,215,72),fill=(218,197,142))
    d.polygon([(0,176),(64,83),(110,147),(151,103),(256,184),(256,256),(0,256)],fill=(73,100,90))
    d.polygon([(0,210),(80,157),(137,203),(200,136),(256,193),(256,256),(0,256)],fill=(35,67,65))
    d.line([(47,97),(78,171),(127,102),(174,171),(209,95)],fill=(232,226,204),width=10,joint='curve')
    d.line((48,214,208,214),fill=(196,177,126),width=3)
    im.save(path)


def write_flipbooks(root,specs,size):
    """Keep all vanilla animation entries; freeze only replaced animated surfaces.

    A static high-resolution material must explicitly select frame 0 rather than
    inherit frame indices that point outside its image. Engine water stays live.
    """
    src=ROOT/'source'/'flipbooks.json'
    entries=json.loads(src.read_text())
    paths={'textures/blocks/'+s['name'] for s in specs}
    changed=[]
    for e in entries:
        if e.get('flipbook_texture') in paths:
            e['frames']=[0]
            e['ticks_per_frame']=1
            e['blend_frames']=False
            changed.append(e['flipbook_texture'])
    dump(root,'textures/flipbook_textures.json',entries)
    return changed


def make_archive(root,destination):
    with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(root.rglob('*')):
            if p.is_file():
                info=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,9,17,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                z.writestr(info,p.read_bytes(),compresslevel=6)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--size',type=int,choices=[128,256,512],default=512)
    parser.add_argument('--jobs',type=int,default=4)
    parser.add_argument('--reuse-materials',action='store_true')
    args=parser.parse_args()
    pack=ROOT/'build'/'Wildlight-Realism-Ultra'
    out=ROOT/'dist';out.mkdir(exist_ok=True)
    if pack.exists() and not args.reuse_materials:shutil.rmtree(pack)
    pack.mkdir(parents=True,exist_ok=True)
    specs=catalog()
    actual=set(json.loads((ROOT/'source'/'block-texture-paths.json').read_text()))
    unknown=[s['name'] for s in specs if s['name'] not in actual]
    if unknown:raise ValueError('Unknown vanilla texture paths: '+str(unknown))
    if not args.reuse_materials:
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures=pool.map(lambda s:write_surface(pack,s,args.size),specs)
            for i,name in enumerate(futures,1):
                if i%16==0 or i==len(specs):print(f'Materials {i}/{len(specs)}: {name}',flush=True)
    dump(pack,'manifest.json',{'format_version':2,'header':{
        'name':NAME,'description':f'Natural cinematic lighting, dark nights and {args.size}x PBR materials. Bedrock Vibrant Visuals.',
        'uuid':HEADER_UUID,'version':VERSION,'min_engine_version':[1,26,50]},
        'modules':[{'type':'resources','uuid':MODULE_UUID,'version':VERSION}],
        'capabilities':['pbr'],'metadata':{'authors':['cory56626-art'],'url':'https://github.com/cory56626-art/THEBOBSBATH'}})
    assignments=write_rendering(pack,ROOT/'source'/'biomes.json')
    frozen=write_flipbooks(pack,specs,args.size)
    textures=sorted(p.relative_to(pack).with_suffix('').as_posix() for p in (pack/'textures').rglob('*.png'))
    dump(pack,'textures/textures_list.json',textures)
    icon(pack/'pack_icon.png')
    (pack/'INSTALL.txt').write_text(INSTALL,encoding='utf-8')
    dump(out,'build-report.json',{
        'name':NAME,'version':VERSION,'target':'Bedrock 26.50 / 1.26.50',
        'texture_resolution':args.size,'material_count':len(specs),'texture_images':len(textures),
        'biome_count':len(assignments),'biomes':assignments,
        'static_replacements_for_animated_textures':frozen,
        'in_game_tested':False,'renderer':'Vibrant Visuals','material_origin':'original procedural recipes'})
    from validate import validate
    result=validate(pack)
    dump(out,'validation.json',result)
    destination=out/'Wildlight-Realism-Ultra.mcpack'
    make_archive(pack,destination)
    with zipfile.ZipFile(destination) as z:
        if z.testzip() is not None:raise ValueError('Archive CRC failed')
    digest=hashlib.sha256(destination.read_bytes()).hexdigest()
    (out/'SHA256SUMS.txt').write_text(digest+'  '+destination.name+'\n')
    (out/'INSTALL.txt').write_text(INSTALL)
    print(json.dumps({'path':str(destination),'bytes':destination.stat().st_size,'sha256':digest,'validation':result},indent=2))

if __name__=='__main__':main()
