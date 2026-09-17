"""Original, deterministic, tileable PBR materials. No downloaded texture art.

All heights are in metres; normals are derived from the same microgeometry
that drives the material masks. Albedos contain no baked directional lighting.
"""
from __future__ import annotations
import hashlib
import io
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates, gaussian_filter
from PIL import Image


@dataclass
class Surface:
    color: np.ndarray
    height: np.ndarray
    roughness: object = .8
    metalness: object = 0.0
    emissive: object = 0.0
    subsurface: object = 0.0
    alpha: object = None


class Painter:
    def __init__(self, size, name):
        self.n = size
        seed = int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], 'little')
        self.rng = np.random.default_rng(seed)
        self.y, self.x = np.mgrid[:size, :size].astype(np.float32) / size

    def noise(self, nx, ny=None):
        ny = nx if ny is None else ny
        g = self.rng.uniform(-1, 1, (ny, nx)).astype(np.float32)
        return map_coordinates(g, [self.y * ny, self.x * nx], order=3,
                               mode='grid-wrap', prefilter=True)

    def fbm(self, start=4, octaves=5, falloff=.52):
        return sum(self.noise(start * 2**k) * falloff**k for k in range(octaves))

    def cells(self, count, warp=.12):
        # Periodic jittered Voronoi. F2-F1 gives stable stone/crystal boundaries.
        xx = self.x * count + self.noise(5) * warp
        yy = self.y * count + self.noise(5) * warp
        ix, iy = np.floor(xx).astype(int), np.floor(yy).astype(int)
        offsets = self.rng.uniform(.1, .9, (count, count, 2))
        values = self.rng.uniform(-1, 1, (count, count))
        best = np.full_like(xx, 100.)
        second = best.copy()
        identity = np.zeros_like(xx)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy = ix+dx, iy+dy
                p = offsets[cy % count, cx % count]
                d = (xx-cx-p[..., 0])**2 + (yy-cy-p[..., 1])**2
                closer = d < best
                second = np.where(closer, best, np.minimum(second, d))
                identity = np.where(closer, values[cy % count, cx % count], identity)
                best = np.minimum(best, d)
        return np.sqrt(best), np.sqrt(second)-np.sqrt(best), identity

    @staticmethod
    def rgb(base, variation):
        return np.clip(np.asarray(base, dtype=np.float32)[None,None,:]
                       * (1 + variation[...,None]), 0, 255)

    @staticmethod
    def blend(a, b, mask):
        return a * (1-mask[...,None]) + np.asarray(b) * mask[...,None]

    def rock(self, base=(125,124,120), polished=False, layered=False, crystal=False):
        f = self.fbm(3)
        micro = self.noise(128)
        _, edge, cell = self.cells(7, .25)
        vein = np.exp(-np.abs(self.noise(5)+self.noise(13)*.16)*70)
        grain = self.noise(64)
        color = self.rgb(base, f*.11+grain*.075+micro*.025+cell*.035)
        if crystal:
            color = self.rgb(base, f*.08 + cell*.21 + micro*.03)
            h = .003*cell + .001*grain
            rough = .15 + .06*grain
        elif layered:
            strata = np.sin(2*np.pi*(self.y*13+self.noise(5,3)*.27))
            color *= (1+strata[...,None]*.065)
            h = .006*f+.0015*strata+.001*micro
            rough = .8 + grain*.06
        else:
            color *= (1-vein[...,None]*.055)
            h = .009*f + .002*grain + .0008*micro - .003*vein
            rough = .81 + grain*.08
        if polished:
            h *= .18
            rough = .22 + grain*.045
        return Surface(color,h,rough)

    def aggregate(self, base, count=7, moss=False):
        d, edge, cell = self.cells(count,.32)
        grain = self.fbm(20,4)
        mask = np.clip((edge-.025)*15,0,1)
        color = self.rgb(base, cell*.19+grain*.1)
        color = self.blend(np.broadcast_to([63,60,51],color.shape),color,mask)
        h = .042*(mask**.55) - .009*d + .0018*grain
        rough = .83 + grain*.055
        if moss:
            m = np.clip(self.fbm(7)*2+.05+(1-mask)*.65,0,1)
            color = self.blend(color,self.rgb((67,84,38),grain*.2),m*.88)
            h += m*.008
        return Surface(color,h,rough)

    def soil(self, base=(99, 72, 46), coarse=False):
        f=self.fbm(5)
        micro=self.noise(128)
        _,edge,c=self.cells(30,.2)
        stones=np.clip((c-.42)*5,0,1)*np.clip(edge*16,0,1)
        color=self.rgb(base,f*.16+micro*.07)
        color=self.blend(color,self.rgb((137,128,106),c*.12),stones*(.65 if coarse else .25))
        return Surface(color,.015*f+.003*micro+.014*stones,.95)

    def sand(self, base):
        f=self.fbm(4,4)
        fine=self.noise(128)
        ripple=np.sin(2*np.pi*(self.y*12+self.noise(4)*.33))
        color=self.rgb(base,f*.045+fine*.08+ripple*.023)
        return Surface(color,.003*ripple+.0015*f+.0007*fine,.92)

    def wood(self, base, kind='planks', birch=False):
        x,y=self.x,self.y
        long=self.noise(3,30)
        grainphase=y*65 + long*1.4+self.noise(5,5)*.9
        # Localised, periodic knot deflection without baking a directional shadow.
        knots=np.zeros_like(x)
        for cx,cy in ((.29,.32),(.77,.72)):
            dx=(x-cx+.5)%1-.5;dy=(y-cy+.5)%1-.5
            r=np.sqrt((dx/.17)**2+(dy/.048)**2)
            grainphase += np.exp(-r*r*.25)*2.7*np.sin(np.arctan2(dy/.048,dx/.17))
            knots += np.exp(-r*r*2)
        grain=np.sin(2*np.pi*grainphase)
        pores=np.clip((self.noise(3,110)-.2)*2.8,0,1)
        f=self.fbm(4,4)
        color=self.rgb(base,long*.085+grain*.075+f*.045-knots*.25-pores*.04)
        h=.0016*grain+.0006*f-.001*pores
        rough=.65+self.noise(16)*.08
        if kind=='planks':
            row=np.floor(y*4).astype(int)
            fy=(y*4)%1
            fx=(x*2+(row%2)*.5)%1
            seam=np.maximum(np.exp(-np.minimum(fy,1-fy)*220),np.exp(-np.minimum(fx,1-fx)*300))
            board=np.array([-.035,.025,-.02,.045])[row]
            color*=1+board[...,None]
            color=self.blend(color,(43, 30, 19),seam*.85)
            h-=seam*.01
        elif kind=='bark':
            ridges=np.sin(2*np.pi*(x*17+self.noise(16,3)*.6))
            split=np.clip((ridges-.15)*1.6,0,1)
            grain=self.noise(35,7)
            color=self.rgb(base,split*.21+grain*.13+f*.11)
            h=.024*split+.004*grain+.002*f
            rough=.92
            if birch:
                marks=np.clip((self.noise(6,32)-.38)*4,0,1)
                color=self.blend(color,(45,42,35),marks*.9)
                h-=marks*.003
        elif kind=='end':
            dx=x-.5;dy=y-.5
            r=np.sqrt(dx*dx+dy*dy)
            ring=np.sin(2*np.pi*(r*36+self.noise(7)*.55))
            edge=np.clip((r-.41)*20,0,1)
            color=self.rgb(base,ring*.07+self.fbm(8)*.05)
            color=self.blend(color,np.asarray(base)*.46,edge)
            h=.0017*ring+.0007*self.noise(64)-edge*.004
        elif kind=='stripped':
            color=np.swapaxes(color,0,1);h=h.T
        return Surface(color,h,rough)

    def bricks(self, base, rows=4, columns=2, moss=False, cracked=False):
        grain=self.fbm(14,4)
        warp=self.noise(24)*.006
        ry=self.y*rows+warp
        row=np.floor(ry).astype(int)
        rx=self.x*columns+(row%2)*.5+warp
        col=np.floor(rx).astype(int)
        fy=ry%1;fx=rx%1
        dist=np.minimum(np.minimum(fy,1-fy)/rows,np.minimum(fx,1-fx)/columns)
        m=np.clip((dist-.006)*140,0,1)
        unit=self.rng.uniform(-.12,.12,(rows,columns))
        v=unit[row%rows,col%columns]
        color=self.rgb(base,v+grain*.11)
        color=self.blend(np.broadcast_to([88,84,73],color.shape),color,m)
        h=m*.022+grain*.0018
        if cracked:
            crack=np.exp(-np.abs(self.noise(9))*110)*m
            color*=1-crack[...,None]*.4;h-=crack*.012
        if moss:
            mossmask=np.clip(self.fbm(5)*2.3-.1+(1-m)*.4,0,1)
            color=self.blend(color,self.rgb((66,83,35),grain*.2),mossmask*.8)
            h+=mossmask*.004
        return Surface(color,h,.83+grain*.055)

    def metal(self, base, oxidation=0, cut=False):
        grain=self.noise(2,128)
        f=self.fbm(4,4)
        stain=np.clip(f*1.8+oxidation,0,1)
        color=self.rgb(base,grain*.025+f*.035)
        metallic=np.ones_like(f)
        rough=.2+grain*.03+np.abs(f)*.05
        if oxidation:
            color=self.blend(color,self.rgb((70,137,117),f*.15),stain)
            metallic=1-stain
            rough=rough*(1-stain)+.82*stain
        h=grain*.0002+f*.0003
        cells=2 if cut else 1
        u=(self.x*cells)%1;v=(self.y*cells)%1
        edge=np.maximum(np.exp(-np.minimum(u,1-u)*230),np.exp(-np.minimum(v,1-v)*230))
        h-=edge*.004
        color*=1-edge[...,None]*.1
        return Surface(color,h,rough,metallic)

    def ore(self, base, inclusion, deep=False, metallic=False, emissive=0):
        s=self.rock(base,layered=deep)
        _,edge,c=self.cells(8,.32)
        mask=np.clip((c-.30)*6,0,1)*np.clip((edge-.02)*19,0,1)
        f=self.noise(60)
        orecolor=self.rgb(inclusion,c*.1+f*.13)
        s.color=self.blend(s.color,orecolor,mask)
        s.height+=mask*.007+f*mask*.002
        s.roughness=np.asarray(s.roughness)*(1-mask)+(.25 if metallic else .4)*mask
        s.metalness=mask if metallic else 0
        s.emissive=mask*emissive
        return s

    def grass(self, carried=False, side=False):
        # Blades use wrapped coordinates; the untinted top is grayscale for biome tint.
        f=self.fbm(12,4)
        blade=self.noise(80,35)
        v=.08*f+.1*blade
        rgb=self.rgb((121,146,88) if carried else (167,167,167),v)
        h=.005*f+.006*blade
        if side:
            dirt=self.soil()
            cutoff=.17+self.noise(24,2)*.065
            mask=np.clip((cutoff-self.y)*100,0,1)
            rgb=self.blend(dirt.color,self.rgb((102,132,65),v),mask)
            h=dirt.height*(1-mask)+h*mask
        return Surface(rgb,h,.88,subsurface=.10)

    def foliage(self, color=(166,166,166), opaque=False, needles=False, flowers=False):
        n=self.n
        rgb=np.zeros((n,n,3),np.float32)
        height=np.zeros((n,n),np.float32)
        alpha=np.zeros((n,n),np.float32)
        count=100 if needles else 70
        for i in range(count):
            cx,cy=self.rng.random(2);angle=self.rng.uniform(0,2*np.pi)
            dx=(self.x-cx+.5)%1-.5;dy=(self.y-cy+.5)%1-.5
            u=dx*np.cos(angle)+dy*np.sin(angle)
            v=-dx*np.sin(angle)+dy*np.cos(angle)
            length=self.rng.uniform(.06,.14)
            width=length*(.11 if needles else .44)
            shape=(u/length)**2+(v/width)**2
            mask=np.clip((1-shape)*60,0,1)
            vein=np.exp(-np.abs(v/width)*60)
            ribs=np.exp(-np.abs(np.sin(u/length*22+np.abs(v/width)*12))*15)
            tone=self.rng.uniform(.62,1.14)
            cc=np.asarray(color)[None,None,:]*tone*(1-.11*ribs[...,None]+vein[...,None]*.06)
            if flowers and i%5==0:cc=np.broadcast_to([212,174,185],cc.shape)
            rgb=self.blend(rgb,cc,mask)
            height=height*(1-mask)+mask*(.008+np.maximum(0,1-shape)*.004+vein*.001)
            alpha=np.maximum(alpha,mask)
        if opaque:
            rgb=self.blend(np.broadcast_to(np.asarray(color)*.3,rgb.shape),rgb,alpha)
            alpha=np.ones_like(alpha)
        # RGB bleeding prevents black fringes around alpha cutouts after mipmapping.
        visible=alpha>.05
        from scipy.ndimage import distance_transform_edt
        if not opaque and visible.any():
            idx=distance_transform_edt(~visible,return_distances=False,return_indices=True)
            rgb[~visible]=rgb[idx[0][~visible],idx[1][~visible]]
        return Surface(rgb,height,.72,subsurface=.35,alpha=alpha)

    def fabric(self, base):
        warp=np.sin(2*np.pi*self.x*64)
        weft=np.sin(2*np.pi*self.y*64)
        checker=(np.floor(self.x*64)+np.floor(self.y*64))%2
        weave=np.where(checker==0,warp,weft)
        f=self.fbm(12,3)
        color=self.rgb(base,weave*.055+f*.025)
        return Surface(color,.0015*weave+.0006*f,.96)

    def emissive_rock(self, base, glow, kind='magma'):
        f=self.fbm(4)
        d,edge,c=self.cells(6,.42)
        mask=np.clip((.1-edge)*14,0,1)
        if kind=='glowstone':mask=np.clip(edge*14,0,1)
        if kind=='crying':mask*=np.clip((self.noise(4,12)+.3)*1.7,0,1)
        color=self.rgb(base,c*.15+f*.1)
        color=self.blend(color,self.rgb(glow,f*.12),mask)
        return Surface(color,.017*np.clip(edge*10,0,1)+f*.004,.64,emissive=mask*.85)


def surface_for(size, spec):
    p=Painter(size,spec.get('seed',spec['name']))
    kind=spec['kind'];color=spec.get('color',(120,120,120))
    args=spec.get('args',{})
    if kind=='rock':s=p.rock(color,**args)
    elif kind=='aggregate':s=p.aggregate(color,**args)
    elif kind=='soil':s=p.soil(color,**args)
    elif kind=='sand':s=p.sand(color)
    elif kind=='wood':s=p.wood(color,**args)
    elif kind=='bricks':s=p.bricks(color,**args)
    elif kind=='metal':s=p.metal(color,**args)
    elif kind=='ore':s=p.ore(color,**args)
    elif kind=='grass':s=p.grass(**args)
    elif kind=='foliage':s=p.foliage(color,**args)
    elif kind=='fabric':s=p.fabric(color)
    elif kind=='emissive':s=p.emissive_rock(color,**args)
    elif kind=='snow_side':
        soil=p.soil()
        f=p.fbm(5,4)
        mask=np.clip((.24+p.noise(18,2)*.035-p.y)*100,0,1)
        s=Surface(p.blend(soil.color,p.rgb(color,f*.025),mask),
                  soil.height*(1-mask)+(.012+f*.004)*mask,.88)
    elif kind=='snow':
        f=p.fbm(4,4);grain=p.noise(128)
        s=Surface(p.rgb(color,f*.025+grain*.015),.008*f+.0008*grain,.8,subsurface=.2)
    elif kind=='ice':
        f=p.fbm(5,4);_,edge,c=p.cells(5,.25)
        crack=np.exp(-edge*100)
        s=Surface(p.rgb(color,f*.08+crack*.16),.001*f-.002*crack,.12,subsurface=.12)
        if args.get('transparent'):s.alpha=np.full((size,size),.72)
    elif kind=='concrete':
        f=p.fbm(8,4);fine=p.noise(128)
        s=Surface(p.rgb(color,f*.024+fine*.02),.0005*f+.00025*fine,.85)
    else:raise ValueError(kind)
    return s


def write_surface(directory, spec, size):
    import json
    name=spec['name'];s=surface_for(size,spec)
    target=directory/'textures'/'blocks'/name
    target.parent.mkdir(parents=True,exist_ok=True)
    def channel(a):return np.broadcast_to(a,(size,size))
    rgb=np.clip(s.color,0,255).astype(np.uint8)
    if s.alpha is not None:rgb=np.dstack((rgb,np.clip(channel(s.alpha)*255,0,255).astype(np.uint8)))
    # Centred periodic derivatives, positive tangent Y points up the image.
    dx=(np.roll(s.height,-1,axis=1)-np.roll(s.height,1,axis=1))*(size/2)
    dy=(np.roll(s.height,-1,axis=0)-np.roll(s.height,1,axis=0))*(size/2)
    normal=np.dstack((-dx,dy,np.ones_like(dx)))
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    normal=np.rint((normal*.5+.5)*255).clip(0,255).astype(np.uint8)
    mers=np.stack([channel(s.metalness),channel(s.emissive),channel(s.roughness),channel(s.subsurface)],axis=2)
    mers=np.rint(mers.clip(0,1)*255).astype(np.uint8)
    # Maps remain RGB/RGBA, never indexed palettes (required by the PBR loader).
    for suffix,data in [('',rgb),('_normal',normal),('_mers',mers)]:
        output=Path(str(target)+suffix+'.png')
        buffer=io.BytesIO()
        Image.fromarray(data).save(buffer,format='PNG',compress_level=6)
        payload=buffer.getvalue()
        # Export the complete encoded file in one transaction. Publishing the
        # path only after close avoids truncated assets in concurrent readers.
        temporary=output.with_suffix('.png.part')
        with temporary.open('wb') as f:
            f.write(payload);f.flush();os.fsync(f.fileno())
        os.replace(temporary,output)
    leaf=target.name
    texture={'format_version':'1.21.30','minecraft:texture_set':{
        'color':leaf,'normal':leaf+'_normal','metalness_emissive_roughness_subsurface':leaf+'_mers'}}
    Path(str(target)+'.texture_set.json').write_text(json.dumps(texture,indent=2)+'\n')
    return name
