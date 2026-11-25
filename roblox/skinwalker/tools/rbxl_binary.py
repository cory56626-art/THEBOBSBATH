"""Writer for Roblox's binary place format (.rbxl).

Takes the same Inst trees as rbx.write_place. Chunks are LZ4-compressed when
the `lz4` package is available, otherwise stored uncompressed.
"""
from __future__ import annotations

import struct

try:
    import lz4.block as _lz4
except ImportError:  # pragma: no cover
    _lz4 = None

SERVICES = {"Workspace", "Lighting", "StarterPlayer", "ReplicatedStorage", "ServerScriptService",
            "ServerStorage", "StarterGui", "StarterPack", "SoundService", "Players", "Teams"}

TYPE_ID = {
    "string": 0x01, "ProtectedString": 0x01, "BinaryString": 0x01, "bool": 0x02, "int": 0x03, "float": 0x04, "double": 0x05,
    "Color3": 0x0C, "Vector3": 0x0E, "CoordinateFrame": 0x10, "token": 0x12, "Ref": 0x13,
    "NumberSequence": 0x15, "NumberRange": 0x17, "ColorSequence": 0x19, "Color3uint8": 0x1A,
}

DEFAULTS = {
    "string": "", "ProtectedString": "", "BinaryString": "", "bool": False, "int": 0, "float": 0.0, "double": 0.0,
    "Color3": (0, 0, 0), "Vector3": (0.0, 0.0, 0.0), "CoordinateFrame": None, "token": 0, "Ref": None,
    "NumberSequence": [(0, 0, 0), (1, 0, 0)], "NumberRange": (0, 0), "ColorSequence": [(0, (0, 0, 0)), (1, (0, 0, 0))],
    "Color3uint8": (0, 0, 0),
}


# ------------------------------------------------------------------ primitive encoders
def _interleave(words: list[bytes]) -> bytes:
    if not words:
        return b""
    width = len(words[0])
    return b"".join(bytes(w[i] for w in words) for i in range(width))


def _zigzag(n: int) -> int:
    return ((n << 1) ^ (n >> 31)) & 0xFFFFFFFF


def ints(values) -> bytes:
    return _interleave([struct.pack(">I", _zigzag(int(n))) for n in values])


def uints(values) -> bytes:
    return _interleave([struct.pack(">I", int(n) & 0xFFFFFFFF) for n in values])


def rfloats(values) -> bytes:
    out = []
    for x in values:
        bits = struct.unpack(">I", struct.pack(">f", float(x)))[0]
        out.append(struct.pack(">I", ((bits << 1) | (bits >> 31)) & 0xFFFFFFFF))
    return _interleave(out)


def refs(values) -> bytes:
    acc, prev = [], 0
    for r in values:
        acc.append(r - prev)
        prev = r
    return ints(acc)


def string(s) -> bytes:
    b = s.encode("utf-8") if isinstance(s, str) else s
    return struct.pack("<I", len(b)) + b


# ------------------------------------------------------------------ writer
def write_rbxl(services, path: str):
    # flatten depth-first so parents come before children
    order, parent_of = [], {}

    def walk(inst, parent):
        order.append(inst)
        parent_of[id(inst)] = parent
        for c in inst.children:
            walk(c, inst)

    for s in services:
        walk(s, None)
    ref_id = {id(inst): i for i, inst in enumerate(order)}

    classes: dict[str, list] = {}
    for inst in order:
        classes.setdefault(inst.cls, []).append(inst)
    class_names = sorted(classes)
    class_id = {name: i for i, name in enumerate(class_names)}

    chunks = []
    meta = struct.pack("<I", 1) + string("ExplicitAutoJoints") + string("true")
    chunks.append(("META", meta))

    for name in class_names:
        insts = classes[name]
        is_service = name in SERVICES
        data = struct.pack("<I", class_id[name]) + string(name)
        data += struct.pack("<B", 1 if is_service else 0) + struct.pack("<I", len(insts))
        data += refs([ref_id[id(i)] for i in insts])
        if is_service:
            data += b"\x01" * len(insts)
        chunks.append(("INST", data))

    for name in class_names:
        insts = classes[name]
        props: dict[str, str] = {}
        for inst in insts:
            for key, (typ, _) in inst.props.items():
                if key in props and props[key] != typ:
                    raise ValueError(f"{name}.{key} has mixed types")
                props[key] = typ
        for key, typ in props.items():
            values = [inst.props[key][1] if key in inst.props else DEFAULTS[typ] for inst in insts]
            data = struct.pack("<I", class_id[name]) + string(key) + struct.pack("<B", TYPE_ID[typ])
            data += encode_values(typ, values, ref_id)
            chunks.append(("PROP", data))

    prnt = struct.pack("<B", 0) + struct.pack("<I", len(order))
    prnt += refs([ref_id[id(i)] for i in order])
    prnt += refs([ref_id[id(parent_of[id(i)])] if parent_of[id(i)] is not None else -1 for i in order])
    chunks.append(("PRNT", prnt))

    out = bytearray(b"<roblox!\x89\xff\r\n\x1a\n")
    out += struct.pack("<HII", 0, len(class_names), len(order)) + b"\x00" * 8
    for name, data in chunks:
        out += _chunk(name, data)
    out += _chunk("END\x00", b"</roblox>", compress=False)
    with open(path, "wb") as fh:
        fh.write(out)


def _chunk(name: str, data: bytes, compress=True) -> bytes:
    if compress and _lz4 is not None:
        comp = _lz4.compress(data, store_size=False)
        return name.encode("ascii") + struct.pack("<III", len(comp), len(data), 0) + comp
    return name.encode("ascii") + struct.pack("<III", 0, len(data), 0) + data


def encode_values(typ, values, ref_id) -> bytes:
    if typ in ("string", "ProtectedString", "BinaryString"):
        return b"".join(string(str(v)) for v in values)
    if typ == "bool":
        return bytes(1 if v else 0 for v in values)
    if typ == "int":
        return ints(values)
    if typ == "float":
        return rfloats(values)
    if typ == "double":
        return b"".join(struct.pack("<d", float(v)) for v in values)
    if typ == "token":
        return uints(values)
    if typ == "Color3":
        return b"".join(rfloats([c[k] / 255 for c in values]) for k in range(3))
    if typ == "Color3uint8":
        return b"".join(bytes(int(max(0, min(255, round(c[k])))) for c in values) for k in range(3))
    if typ == "Vector3":
        return b"".join(rfloats([vec[k] for vec in values]) for k in range(3))
    if typ == "CoordinateFrame":
        rot = bytearray()
        pos = []
        for cf in values:
            comps = cf.components() if cf is not None else (0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
            rot += b"\x00" + struct.pack("<9f", *comps[3:])
            pos.append(comps[:3])
        return bytes(rot) + b"".join(rfloats([p[k] for p in pos]) for k in range(3))
    if typ == "Ref":
        return refs([ref_id[id(v)] if v is not None else -1 for v in values])
    if typ == "NumberRange":
        return b"".join(struct.pack("<ff", lo, hi) for lo, hi in values)
    if typ == "NumberSequence":
        out = b""
        for seq in values:
            out += struct.pack("<I", len(seq)) + b"".join(struct.pack("<fff", t, v, e) for t, v, e in seq)
        return out
    if typ == "ColorSequence":
        out = b""
        for seq in values:
            out += struct.pack("<I", len(seq))
            out += b"".join(struct.pack("<fffff", t, c[0] / 255, c[1] / 255, c[2] / 255, 0.0) for t, c in seq)
        return out
    raise ValueError(f"no binary encoder for {typ}")
