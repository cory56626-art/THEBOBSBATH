"""Check the packaged resources, not just the generator implementation.

This is static validation against documented invariants. It does not pretend
to replace Minecraft's content log, visual review, or performance profiling.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
from uuid import UUID
import numpy as np
from PIL import Image

def require(condition,message):
    if not condition:raise ValueError(message)

def no_duplicates(pairs):
    d={}
    for k,v in pairs:
        require(k not in d,'Duplicate JSON key: '+k);d[k]=v
    return d

def read(path):
    return json.loads(path.read_text(encoding='utf-8'),object_pairs_hook=no_duplicates,
                      parse_constant=lambda s:(_ for _ in ()).throw(ValueError('Nonfinite '+s)))

def fields(obj,allowed,label):
    require(set(obj)<=set(allowed.split()),label+': unknown fields '+str(set(obj)-set(allowed.split())))

def bounded(value,lo,hi,label):
    vals=value.values() if isinstance(value,dict) else [value]
    if isinstance(value,dict):
        require(all(0<=float(k)<=1 for k in value),label+': invalid time key')
    for v in vals:require(isinstance(v,(int,float)) and lo<=v<=hi,label+': out of range '+str(v))

def validate(root):
    root=Path(root)
    files=sorted(root.rglob('*'))
    jsons={p.relative_to(root).as_posix():read(p) for p in files if p.suffix=='.json'}
    manifest=jsons['manifest.json']
    require(manifest['format_version']==2,'Manifest must use v2')
    require(manifest['capabilities']==['pbr'],'Vibrant Visuals capability missing')
    require(manifest['header']['min_engine_version']>=[1,26,0],'Engine too old for time-keyed ambient light')
    uuids=[manifest['header']['uuid']]+[m['uuid'] for m in manifest['modules']]
    for u in uuids:UUID(u)
    require(len(set(uuids))==len(uuids),'Pack/module UUID collision')
    require(manifest['modules'][0]['type']=='resources','Wrong pack type')
    require(not manifest.get('dependencies'),'Pack should be self-contained')
    identifiers={}
    texture_sets=[]
    for path,data in jsons.items():
        for key,body in data.items() if isinstance(data,dict) else []:
            if key.startswith('minecraft:') and isinstance(body,dict) and 'description' in body:
                ident=body['description']['identifier']
                require(ident not in identifiers,'Duplicate identifier '+ident)
                identifiers[ident]=key
        if path.endswith('.texture_set.json'):texture_sets.append((path,data['minecraft:texture_set']))
    upstream=read(Path(__file__).parent/'source'/'block-texture-paths.json')
    known=set(upstream)
    image_count=0;minimum_z=1.;max_length_error=0.;resolutions=set();transparent_count=0
    for path,tex in texture_sets:
        fields(tex,'color normal heightmap metalness_emissive_roughness metalness_emissive_roughness_subsurface',path)
        require('color' in tex and 'normal' in tex and 'metalness_emissive_roughness_subsurface' in tex,path+': incomplete PBR')
        require('heightmap' not in tex and 'metalness_emissive_roughness' not in tex,path+': mutually exclusive layers')
        stem=path.removeprefix('textures/blocks/').removesuffix('.texture_set.json')
        require(stem in known,path+': no such vanilla texture')
        dims=[];maps={}
        for field,value in tex.items():
            require(isinstance(value,str),path+': expected image-backed layer')
            target=root/Path(path).parent/(value+'.png')
            require(target.is_file(),path+': missing '+str(target))
            with Image.open(target) as image:
                image.load()
                expected=('RGBA',) if field.endswith('_subsurface') else ('RGB','RGBA')
                require(image.mode in expected,str(target)+': wrong channels '+image.mode)
                width,height=image.size
                require(width==height and width in (128,256,512),str(target)+': wrong dimensions')
                dims.append(image.size);maps[field]=np.asarray(image)
                image_count+=1;resolutions.add(width)
        require(len(set(dims))==1,path+': maps differ in size')
        normal=maps['normal'][...,:3].astype(float)/255*2-1
        error=float(np.max(np.abs(np.linalg.norm(normal,axis=2)-1)))
        max_length_error=max(max_length_error,error)
        require(error<.014,path+': non-unit normal map')
        minimum_z=min(minimum_z,float(normal[...,2].min()))
        require(normal[...,2].min()>0,path+': backward-facing normal')
        mers=maps['metalness_emissive_roughness_subsurface']
        require(not np.any((mers[...,0]>0)&(mers[...,3]>0)),path+': metalness/SSS conflict')
        if maps['color'].shape[2]==4:
            a=maps['color'][...,3];require(a.max()>0,path+': fully invisible material')
            if a.min()<255:transparent_count+=1
    expected_images={p.relative_to(root).with_suffix('').as_posix() for p in (root/'textures').rglob('*.png')}
    actual_list=jsons['textures/textures_list.json']
    require(set(actual_list)==expected_images,'textures_list.json does not match actual assets')
    require(len(actual_list)==len(set(actual_list)),'Duplicate texture registry entry')
    biomes=[(p,d['minecraft:client_biome']) for p,d in jsons.items() if p.startswith('biomes/')]
    expected_biomes={d['minecraft:client_biome']['description']['identifier'] for d in read(Path(__file__).parent/'source'/'biomes.json')}
    require({d['description']['identifier'] for _,d in biomes}==expected_biomes,'Incomplete stable biome coverage')
    for path,b in biomes:
        for short in ['lighting','atmosphere','color_grading','water']:
            field=short+'_identifier'
            target=b['components']['minecraft:'+field][field]
            require(identifiers.get(target)=='minecraft:'+short+'_settings',path+': unresolved '+target)
        fogid=b['components']['minecraft:fog_appearance']['fog_identifier']
        require(fogid.startswith('minecraft:') or identifiers.get(fogid)=='minecraft:fog_settings',path+': unresolved fog')
    operators=set();offsets=set();caustics=set();wave_enable=set()
    for path,data in jsons.items():
        if path.startswith('lighting/'):
            body=data['minecraft:lighting_settings']
            fields(body,'description directional_lights emissive ambient sky',path)
            orbital=body['directional_lights']['orbital']
            fields(orbital,'sun moon orbital_offset_degrees',path)
            offsets.add(orbital['orbital_offset_degrees'])
            for light in ['sun','moon']:
                bounded(orbital[light]['illuminance'],0,200000,path+' '+light)
            bounded(body['ambient']['illuminance'],0,5,path+' ambient')
            bounded(body['sky']['intensity'],.1,1,path+' sky')
            bounded(body['emissive']['desaturation'],0,1,path+' emissive')
        elif path.startswith('color_grading/'):
            body=data['minecraft:color_grading_settings']
            fields(body,'description color_grading tone_mapping',path)
            operators.add(body['tone_mapping']['operator'])
            for zone,grade in body['color_grading'].items():
                if zone=='temperature':continue
                fields(grade,'enabled shadowsMax highlightsMin contrast gain gamma offset saturation',path+' '+zone)
                for key,low,high in [('contrast',0,4),('gain',0,10),('gamma',0,4),('offset',-1,1),('saturation',0,10)]:
                    if key in grade:
                        require(len(grade[key])==3,path+': bad color vector')
                        for v in grade[key]:bounded(v,low,high,path+' '+key)
        elif path.startswith('atmospherics/'):
            fields(data['minecraft:atmosphere_settings'],
                   'description horizon_blend_stops rayleigh_strength sun_mie_strength moon_mie_strength sun_glare_shape sky_zenith_color sky_horizon_color',path)
        elif path.startswith('water/'):
            body=data['minecraft:water_settings']
            fields(body,'description particle_concentrations waves caustics biome_water_color_contribution',path)
            w=body['waves'];fields(w,'enabled depth direction_increment frequency frequency_scaling mix octaves pull sampleWidth shape speed speed_scaling',path)
            for key,low,high in [('depth',0,3),('direction_increment',0,360),('frequency',.01,3),('frequency_scaling',0,2),('mix',0,1),('octaves',1,30),('pull',-1,1),('sampleWidth',.01,1),('shape',1,10),('speed',.01,10),('speed_scaling',0,2)]:bounded(w[key],low,high,path+' '+key)
            require(type(w['octaves']) is int,path+': octaves must be an integer')
            c=body['caustics'];fields(c,'enabled frame_length power scale texture',path)
            caustics.add(json.dumps(c,sort_keys=True));wave_enable.add(w['enabled'])
            for key,high in [('chlorophyll',10),('cdom',15),('suspended_sediment',300)]:bounded(body['particle_concentrations'][key],0,high,path)
        elif path.startswith('fogs/'):
            b=data['minecraft:fog_settings'];fields(b,'description distance volumetric',path)
            for dist in b['distance'].values():
                require(0<=dist['fog_start']<dist['fog_end'],path+': reversed fog distance')
                require(dist['render_distance_type'] in ('fixed','render'),path+': invalid fog units')
    require(operators=={'aces'},'Mixed or unexpected tone mapping')
    require(len(offsets)==1,'Orbital offset cannot be interpolated between biomes')
    require(len(caustics)==1 and wave_enable=={True},'Water settings must remain blend-compatible')
    for entry in jsons['textures/flipbook_textures.json']:
        target=root/(entry['flipbook_texture']+'.png')
        if target.exists():require(entry.get('frames')==[0],'Static replacement inherits invalid animation frames')
    return {'status':'passed','json_files':len(jsons),'material_sets':len(texture_sets),
            'material_images':image_count,'resolutions':sorted(resolutions),'biomes':len(biomes),
            'transparent_materials':transparent_count,'normal_max_unit_error':round(max_length_error,6),
            'normal_min_forward_component':round(minimum_z,6),
            'checks':['JSON parsing and duplicate keys','manifest UUIDs and capability','documented configuration fields and ranges',
                      'resource identifiers and all stable biomes','vanilla texture paths','image dimensions and channel layouts',
                      'normal-map unit length and orientation','metalness/subsurface exclusivity','biome blend constraints',
                      'texture registry completeness','replacement animation frame indices'],
            'in_game_tested':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('pack',type=Path)
    print(json.dumps(validate(p.parse_args().pack),indent=2))
