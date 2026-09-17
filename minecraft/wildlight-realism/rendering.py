"""Documented stable Bedrock Vibrant Visuals settings, authored for Wildlight."""
from copy import deepcopy
import json
from pathlib import Path

NS='wildlight'

def dump(root,path,value):
    p=root/path;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')

def document(kind,identifier,body,version='1.26.0'):
    return {'format_version':version,'minecraft:'+kind+'_settings':{
        'description':{'identifier':NS+':'+identifier},**body}}

def curve(values):
    return {str(k):v for k,v in values}

def lighting(profile):
    sun=curve([(0,108000),(.12,88000),(.2,41000),(.245,8500),(.27,650),(.29,0),
               (.71,0),(.73,650),(.755,8500),(.8,41000),(.88,88000),(1,108000)])
    color=curve([(0,'#FFF9EF'),(.17,'#FFF0D9'),(.23,'#FFCCA0'),(.27,'#F99E74'),
                 (.3,'#CC9588'),(.7,'#CC9588'),(.73,'#F9AC82'),(.77,'#FFDCB3'),
                 (.83,'#FFF1DC'),(1,'#FFF9EF')])
    moon=curve([(0,0),(.24,0),(.3,.065),(.5,.095),(.7,.065),(.76,0),(1,0)])
    ambient=curve([(0,.0018),(.25,.001),(.32,.0006),(.5,.0006),(.68,.0006),(.75,.001),(1,.0018)])
    sky=curve([(0,.82),(.2,.72),(.3,.16),(.5,.12),(.7,.16),(.8,.72),(1,.82)])
    flash={'illuminance':6.0,'color':'#C6B6EC'}
    if profile=='dry':sun={k:v*1.08 for k,v in sun.items()}
    elif profile in ('forest','swamp'):sun={k:v*.9 for k,v in sun.items()}
    elif profile=='cave':
        ambient=.00025;sky=.3
    elif profile=='nether':
        sun=0;moon=0;ambient=.05;sky=.14
    elif profile=='end':
        sun=0;moon=0;ambient=.025;sky=.18
    return document('lighting',profile+'_lighting',{
        'directional_lights':{
            'orbital':{'sun':{'illuminance':sun,'color':color},
                       'moon':{'illuminance':moon,'color':'#CED9EA'},
                       'orbital_offset_degrees':8.0},'flash':flash},
        'emissive':{'desaturation':.12},
        'ambient':{'illuminance':ambient,'color':'#DBE1E9' if profile not in ('nether','end') else '#CFBFBB'},
        'sky':{'intensity':sky}})

def atmosphere(profile):
    zenith=curve([(0,'#6196C1'),(.16,'#6A9CBD'),(.25,'#526B90'),(.3,'#23344D'),
                  (.36,'#0A1121'),(.5,'#080F1C'),(.64,'#0A1121'),(.7,'#253951'),
                  (.75,'#687E9B'),(.84,'#74A0BF'),(1,'#6196C1')])
    horizon=curve([(0,'#D7E2E5'),(.17,'#E8D8C2'),(.25,'#E7AE82'),(.3,'#836B74'),
                   (.35,'#253148'),(.5,'#111B2D'),(.65,'#253148'),(.7,'#8C7B88'),
                   (.75,'#E9C099'),(.83,'#DFE0D7'),(1,'#D7E2E5')])
    if profile=='nether':zenith='#23161B';horizon='#3A2422'
    elif profile=='end':zenith='#080911';horizon='#30243D'
    strength=curve([(0,1.05),(.2,.73),(.25,.24),(.35,.32),(.5,.38),(.65,.32),(.75,.24),(.8,.73),(1,1.05)])
    return document('atmosphere',profile+'_atmosphere',{
        'horizon_blend_stops':{'min':0,'start':.23,'mie_start':.52,'max':.25},
        'rayleigh_strength':strength if profile not in ('nether','end') else .12,
        'sun_mie_strength':curve([(0,.65),(.2,1.3),(.25,1.8),(.31,.25),(.69,.25),(.75,1.65),(.8,1.1),(1,.65)]),
        'moon_mie_strength':.2,'sun_glare_shape':18.,
        'sky_zenith_color':zenith,'sky_horizon_color':horizon},'1.21.40')

def grading(profile):
    # No fictional exposure/bloom controls: all fields are in Mojang's schema.
    shadowgain=.73 if profile not in ('nether','end') else .83
    return document('color_grading',profile+'_grading',{
        'color_grading':{
            'midtones':{'contrast':[1.035]*3,'gain':[1.0]*3,'gamma':[2.15]*3,
                        'offset':[0.0]*3,'saturation':[.96]*3},
            'shadows':{'enabled':True,'shadowsMax':.3,'contrast':[1.06]*3,
                       'gain':[shadowgain]*3,'gamma':[2.04]*3,'offset':[0]*3,'saturation':[.92]*3},
            'highlights':{'enabled':True,'highlightsMin':1.8,'contrast':[1.0]*3,
                          'gain':[.98]*3,'gamma':[2.2]*3,'offset':[0]*3,'saturation':[.94]*3},
            'temperature':{'enabled':True,'temperature':6500,'type':'white_balance'}},
        'tone_mapping':{'operator':'aces'}},'1.21.90')

def water(profile):
    properties={
        'clear':(.08,.16,.2,.23,.8),
        'ocean':(.12,.12,.3,.34,.68),
        'tropical':(.035,.04,.1,.3,.72),
        'cold':(.06,.08,.25,.24,.72),
        'river':(.25,.5,1.1,.13,.95),
        'swamp':(1.3,2.2,7.,.08,.95),
    }
    chlorophyll,cdom,sediment,depth,frequency=properties[profile]
    return document('water',profile+'_water',{
        'particle_concentrations':{'chlorophyll':chlorophyll,'cdom':cdom,'suspended_sediment':sediment},
        'waves':{'enabled':True,'depth':depth,'direction_increment':79.,'frequency':frequency,
                 'frequency_scaling':1.19,'mix':.23,'octaves':28,'pull':.28,'sampleWidth':.025,
                 'shape':1.35,'speed':1.3,'speed_scaling':1.025},
        'caustics':{'enabled':True,'frame_length':.065,'power':2,'scale':.6},
        'biome_water_color_contribution':.035})

def fog(profile):
    density={'temperate':.007,'forest':.011,'swamp':.018,'cold':.006,'dry':.004,'cave':.008}[profile]
    color={'temperate':'#B7CCDA','forest':'#B0C5BD','swamp':'#A8B8A6','cold':'#C0D1DE',
           'dry':'#D8CBB6','cave':'#889AA4'}[profile]
    return document('fog',profile+'_fog',{
        'distance':{
            'air':{'fog_start':.72,'fog_end':1.,'fog_color':color,'render_distance_type':'render'},
            'weather':{'fog_start':.15,'fog_end':.85,'fog_color':'#8B9BA4','render_distance_type':'render'},
            'water':{'fog_start':0.,'fog_end':30. if profile!='swamp' else 12.,'fog_color':'#3B6878','render_distance_type':'fixed'},
            'lava':{'fog_start':0.,'fog_end':1.,'fog_color':'#B74108','render_distance_type':'fixed'},
            'lava_resistance':{'fog_start':0.,'fog_end':3.,'fog_color':'#B74108','render_distance_type':'fixed'},
            'powder_snow':{'fog_start':0.,'fog_end':2.,'fog_color':'#D5DDE2','render_distance_type':'fixed'}},
        'volumetric':{
            'density':{'air':{'max_density':density,'zero_density_height':156.,'max_density_height':54.},
                       'water':{'max_density':.16,'uniform':True}},
            'media_coefficients':{'air':{'scattering':[.035,.035,.035],'absorption':[0.,0.,0.]},
                                   'water':{'scattering':[.017,.025,.031],'absorption':[.13,.055,.025]}}}},'1.16.100')

def choose_profile(name):
    if name=='the_end':return 'end'
    if name in ('hell','basalt_deltas','crimson_forest','warped_forest','soulsand_valley'):return 'nether'
    if 'cave' in name or name=='deep_dark':return 'cave'
    if 'swamp' in name:return 'swamp'
    if any(k in name for k in ('desert','mesa','savanna')):return 'dry'
    if any(k in name for k in ('cold','frozen','ice','snow','grove','peaks')) and name!='cherry_grove':return 'cold'
    if any(k in name for k in ('forest','taiga','jungle','pale_garden')):return 'forest'
    return 'temperate'

def choose_water(name,profile):
    if profile=='swamp':return 'swamp'
    if 'river' in name:return 'river'
    if profile=='cold':return 'cold'
    if 'warm_ocean' in name:return 'tropical'
    if 'ocean' in name:return 'ocean'
    return 'clear'

def write_rendering(root,biome_source):
    profiles=['temperate','forest','swamp','cold','dry','cave','nether','end']
    for name in profiles:
        dump(root,'lighting/'+('global' if name=='temperate' else name)+'.json',lighting(name))
        dump(root,'atmospherics/'+('atmospherics' if name=='temperate' else name)+'.json',atmosphere(name))
        dump(root,'color_grading/'+('color_grading' if name=='temperate' else name)+'.json',grading(name))
        if name not in ('nether','end'):dump(root,'fogs/'+name+'.json',fog(name))
    for name in ['clear','ocean','tropical','cold','river','swamp']:
        dump(root,'water/'+('water' if name=='clear' else name)+'.json',water(name))
    lights={}
    for names,color,kind in [
        (['torch','lantern','candle'],'#FFD49D','point_light'),
        (['soul_torch','soul_lantern'],'#70DCE8','point_light'),
        (['redstone_torch'],'#F24630','point_light'),
        (['end_rod'],'#F0E9DC','point_light'),
        (['sea_pickle'],'#D9E9BA','point_light'),
        (['copper_torch','copper_lantern'],'#BDEAAC','point_light'),
        (['lava','flowing_lava','magma','campfire'],'#F3A05D','static_light'),
        (['glowstone','shroomlight'],'#F7D5A2','static_light'),
        (['sea_lantern'],'#C9E5DE','static_light'),
        (['soul_campfire'],'#70DCE8','static_light')]:
        for n in names:lights['minecraft:'+n]={'light_color':color,'light_type':kind}
    dump(root,'local_lighting/local_lighting.json',{'format_version':'1.21.120','minecraft:local_light_settings':lights})
    dump(root,'shadows/global.json',{'format_version':'1.21.80','minecraft:shadow_settings':{'shadow_style':'soft_shadows'}})
    dump(root,'pbr/global.json',{'format_version':'1.21.40','minecraft:pbr_fallback_settings':{
        k:{'global_metalness_emissive_roughness_subsurface':[0,0,r,0]}
        for k,r in [('blocks',224),('actors',230),('particles',255),('items',210)]}})
    records=json.loads(Path(biome_source).read_text())
    assignments=[]
    for record in records:
        data=deepcopy(record)
        biome=data['minecraft:client_biome']
        name=biome['description']['identifier'].split(':')[-1]
        profile=choose_profile(name);wp=choose_water(name,profile)
        components=biome['components']
        for field,value in [('lighting',profile+'_lighting'),('atmosphere',profile+'_atmosphere'),
                            ('color_grading',profile+'_grading'),('water',wp+'_water')]:
            components['minecraft:'+field+'_identifier']={field+'_identifier':NS+':'+value}
        if profile not in ('nether','end'):
            components['minecraft:fog_appearance']={'fog_identifier':NS+':'+profile+'_fog'}
        dump(root,'biomes/'+name+'.client_biome.json',data)
        assignments.append({'biome':name,'lighting':profile,'water':wp})
    return assignments
