"""Block texture paths and art direction, matched to Bedrock 1.26.50 assets."""

def catalog():
    specs=[]
    def add(name,kind,color=None,seed=None,**args):
        item={'name':name,'kind':kind,'args':args}
        if color is not None:item['color']=color
        if seed is not None:item['seed']=seed
        specs.append(item)
    for name,color,polished,layered in [
        ('stone',(125,124,119),False,False),
        ('stone_granite',(143,104,91),False,False),
        ('stone_granite_smooth',(157,119,105),True,False),
        ('stone_diorite',(183,181,169),False,False),
        ('stone_diorite_smooth',(194,193,181),True,False),
        ('stone_andesite',(123,126,123),False,False),
        ('stone_andesite_smooth',(140,144,140),True,False),
        ('deepslate/deepslate',(63,65,67),False,True),
        ('deepslate/deepslate_top',(69,70,73),False,False),
        ('deepslate/polished_deepslate',(70,72,76),True,True),
        ('bedrock',(48,49,48),False,False),
        ('tuff',(102,106,95),False,False),('polished_tuff',(109,113,103),True,False),
        ('calcite',(211,207,193),False,False),
        ('dripstone_block',(139,113,94),False,True),
        ('blackstone',(46,42,47),False,False),('blackstone_top',(52,47,51),False,False),
        ('polished_blackstone',(52,48,56),True,False),
        ('basalt_side',(67,65,64),False,True),('basalt_top',(73,71,70),False,False),
        ('smooth_basalt',(81,79,77),True,False),
        ('obsidian',(27,24,34),True,False),
        ('quartz_block_side',(216,211,196),True,False),
        ('quartz_block_top',(218,214,201),True,False),
        ('quartz_block_bottom',(217,213,201),True,False),
        ('end_stone',(192,191,138),False,False),
        ('sulfur',(185,167,55),False,False),('polished_sulfur',(193,177,61),True,False),
    ]:add(name,'rock',color,polished=polished,layered=layered)
    for name,color,count,moss in [
        ('cobblestone',(128,125,115),6,False),('cobblestone_mossy',(122,122,109),6,True),
        ('gravel',(119,113,108),15,False),('deepslate/cobbled_deepslate',(65,66,70),7,False),
        ('netherrack',(94, 40,39),10,False),
    ]:add(name,'aggregate',color,count=count,moss=moss)
    for name,color,rows,cols in [
        ('brick',(149,75,53),4,2),('stonebrick',(133,132,121),4,2),
        ('deepslate/deepslate_bricks',(64,65,68),4,2),
        ('deepslate/deepslate_tiles',(59,61,65),8,4),
        ('polished_blackstone_bricks',(48,45,50),4,2),
        ('nether_brick',(48,27,30),4,2),('red_nether_brick',(100,35,30),4,2),
        ('mud_bricks',(130,106,79),4,2),('end_bricks',(199,198,144),4,2),
        ('prismarine_bricks',(97,151,142),4,2),('quartz_bricks',(220,215,202),4,2),
        ('tuff_bricks',(106,110,100),4,2),('resin_bricks',(192, 90,36),4,2),
        ('sulfur_bricks',(189,172,58),4,2),
    ]:add(name,'bricks',color,rows=rows,columns=cols)
    add('stonebrick_mossy','bricks',(133,132,121),moss=True)
    add('stonebrick_cracked','bricks',(130,130,121),cracked=True)
    add('deepslate/cracked_deepslate_bricks','bricks',(64,65,68),cracked=True)
    add('deepslate/cracked_deepslate_tiles','bricks',(59,61,65),rows=8,columns=4,cracked=True)
    for name,color in [('sandstone',(197,177,131)),('red_sandstone',(174,92,51))]:
        add(name+'_top','sand',color)
        add(name+'_bottom','rock',color,layered=True)
        add(name+'_normal','bricks',color,rows=3,columns=2)
        add(name+'_smooth','bricks',color,rows=2,columns=1)
    add('dirt','soil',(101,74,48))
    add('coarse_dirt','soil',(107,79, 50),coarse=True)
    add('dirt_with_roots','soil',(101,74,48),coarse=True)
    add('mud','soil',(65,60, 50))
    add('packed_mud','soil',(120,95,70))
    add('clay','concrete',(154,163,173))
    add('sand','sand',(213,195,148))
    add('red_sand','sand',(173,91,47))
    add('soul_sand','aggregate',(80, 60,46),count=12)
    add('soul_soil','soil',(74,55,43))
    add('grass_top','grass')
    add('grass_carried','grass',carried=True)
    add('grass_side','grass',side=True)
    add('grass_side_snowed','snow_side',(219,224,225))
    add('moss_block','grass',carried=True)
    add('pale_moss_block','grass')
    add('snow','snow',(230,235,236))
    for name,color in [('ice',(136,172,197)),('ice_packed',(135,167,193)),('blue_ice',(109,150,183))]:
        add(name,'ice',color,transparent=name=='ice')
    woods={
        'oak':((151,114, 68),(87,65,40)),
        'spruce':((104, 70,43),(68,48, 30)),
        'birch':((198,178,125),(199,194,174)),
        'jungle':((161,116, 80),(102,91,53)),
        'acacia':((170,91, 60),(105, 90,74)),
        'big_oak':((71,47,28),(57,45,31)),
    }
    for wood,(inside,bark) in woods.items():
        add('planks_'+wood,'wood',inside)
        # `kind` belongs to the recipe arguments, not the material family.
        add('log_'+wood,'wood',bark)
        specs[-1]['args']={'kind':'bark','birch':wood=='birch'}
        add('log_'+wood+'_top','wood',inside);specs[-1]['args']={'kind':'end'}
        identifier='dark_oak' if wood=='big_oak' else wood
        add('stripped_'+identifier+'_log','wood',inside);specs[-1]['args']={'kind':'stripped'}
        add('stripped_'+identifier+'_log_top','wood',inside);specs[-1]['args']={'kind':'end'}
    for wood,inside,bark in [
        ('mangrove',(135, 70,63),( 80,59, 40)),
        ('cherry',(209,155,144),(75,48,56)),
        ('pale_oak',(198,190,168),(101,99,88)),
        ('poplar',(180,150, 90),(138,139,120)),
    ]:
        add(wood+'_planks','wood',inside)
        side=wood+'_log_side' if wood in ('pale_oak','poplar') else wood+'_log_side'
        add(side,'wood',bark);specs[-1]['args']={'kind':'bark'}
        add(wood+'_log_top','wood',inside);specs[-1]['args']={'kind':'end'}
    for wood,inside,bark in [('crimson',(116,68,85),(86, 40, 50)),('warped',( 60,123,116),(43,84, 80))]:
        add('huge_fungus/'+wood+'_planks','wood',inside)
        add('huge_fungus/'+wood+('_log_side' if wood=='crimson' else '_stem_side'),'wood',bark);specs[-1]['args']={'kind':'bark'}
        add('huge_fungus/'+wood+('_log_top' if wood=='crimson' else '_stem_top'),'wood',inside);specs[-1]['args']={'kind':'end'}
    for wood,tint in [('oak',(109,132,74)),('birch',(109,132,74)),('spruce',(74,109, 80)),
                      ('jungle',(95,137,67)),('acacia',(112,132, 70)),('big_oak',(91,116,64))]:
        for suffix in ('','_opaque','_carried'):
            add('leaves_'+wood+suffix,'foliage',tint if suffix=='_carried' else (164,164,164),
                seed='leaves_'+wood,opaque=suffix=='_opaque',needles=wood=='spruce')
    for name,color,flowers in [('mangrove_leaves',(160,160,160),False),('cherry_leaves',(215,159,176),True),
                              ('azalea_leaves',(107,138,74),False),('azalea_leaves_flowers',(107,138,74),True),
                              ('pale_oak_leaves',(173,173,164),False),('orange_poplar_leaves',(191,110, 40),False),
                              ('red_poplar_leaves',(151, 50,38),False),('yellow_poplar_leaves',(204,174,54),False)]:
        add(name,'foliage',color,seed=name,flowers=flowers)
        add(name+'_opaque','foliage',color,seed=name,opaque=True,flowers=flowers)
    for metal,base in [('iron',(185,188,190)),('gold',(215,168,63)),('copper',(182,110, 70)),('netherite',( 60,55,56))]:
        add(metal+'_block','metal',base)
    for name,oxidation,cut in [('exposed_copper',.35,False),('weathered_copper',.7,False),('oxidized_copper',1.35,False),
                              ('cut_copper',0,True),('exposed_cut_copper',.35,True),('weathered_cut_copper',.7,True),('oxidized_cut_copper',1.35,True)]:
        add(name,'metal',(182,110, 70),oxidation=oxidation,cut=cut)
    for mineral,color,metallic in [('coal',( 30,29,27),False),('iron',(159,125,102),True),
                                  ('gold',(216,166,52),True),('copper',(183,112, 70),True),
                                  ('diamond',(80,186,187),False),('emerald',(49,156, 90),False),
                                  ('lapis',(48,81,164),False),('redstone',(176,42,35),False)]:
        for deep in (False,True):
            name=('deepslate/deepslate_' if deep else '')+mineral+'_ore'
            add(name,'ore',(63,65,67) if deep else (125,124,119),inclusion=color,deep=deep,metallic=metallic)
    add('quartz_ore','ore',( 90,40,40),inclusion=(225,213,194))
    add('nether_gold_ore','ore',( 90,40,40),inclusion=(216,166,52),metallic=True)
    for name,base in [('diamond_block',(93,193,192)),('emerald_block',(52,159,96)),('lapis_block',(42,76,150)),
                      ('amethyst_block',(149,113,175)),('budding_amethyst',(151,115,177)),('redstone_block',(157,35,29))]:
        add(name,'rock',base,crystal=True)
    add('magma','emissive',(51,36,30),glow=(248,104,23))
    add('glowstone','emissive',(127,83,30),glow=(250,213,133));specs[-1]['args']['kind']='glowstone'
    add('crying_obsidian','emissive',(29,23,42),glow=(150,69,229));specs[-1]['args']['kind']='crying'
    colors={
        'white':(211,210,200),'orange':(192,103,42),'magenta':(162, 70,151),
        'light_blue':(100,159,185),'yellow':(213,180, 50),'lime':(121,165,62),
        'pink':(206,137,155),'gray':(63,68,71),'silver':(143,147,144),
        'cyan':(45,119,129),'purple':(105,63,143),'blue':(54,67,137),
        'brown':(105,74,52),'green':(79,104,43),'red':(151,49,42),'black':( 30, 30, 30)}
    for name,color in colors.items():
        add('wool_colored_'+name,'fabric',color)
        add('concrete_'+name,'concrete',color)
        add('hardened_clay_stained_'+name,'concrete',tuple(int(c*.7+b*.3) for c,b in zip(color,(148,91,68))))
    add('hardened_clay','concrete',(150,95,70))
    assert len({s['name'] for s in specs})==len(specs)
    return specs
