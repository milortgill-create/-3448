#!/usr/bin/env python3
"""
Builds a standard glTF 2.0 binary 3D model (public/models/goredoll.glb)
representing the official GoreBox GoreDoll 11-segment ragdoll mesh hierarchy:
  - head, upperTorso, abdomen, upperArmL, forearmL, upperArmR, forearmR, thighL, calfL, thighR, calfR
"""
import json
import struct
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_GLB = ROOT / "public" / "models" / "goredoll.glb"


def make_box_geometry(sx, sy, sz, ox=0.0, oy=0.0, oz=0.0, rz=0.0):
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    cz, sz_rot = math.cos(rz), math.sin(rz)

    faces = [
        # +Z front
        ([(-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)], (0, 0, 1)),
        # -Z back
        ([(hx, -hy, -hz), (-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz)], (0, 0, -1)),
        # +Y top
        ([(-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz), (-hx, hy, -hz)], (0, 1, 0)),
        # -Y bottom
        ([(-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz)], (0, -1, 0)),
        # +X right
        ([(hx, -hy, hz), (hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz)], (1, 0, 0)),
        # -X left
        ([(-hx, -hy, -hz), (-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz)], (-1, 0, 0)),
    ]
    uv_quad = [(0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]

    positions = []
    normals = []
    uvs = []
    indices = []
    v_offset = 0

    for verts, norm in faces:
        nx = norm[0] * cz - norm[1] * sz_rot
        ny = norm[0] * sz_rot + norm[1] * cz
        nz = norm[2]
        for (vx, vy, vz), (u, v) in zip(verts, uv_quad):
            rx = vx * cz - vy * sz_rot + ox
            ry = vx * sz_rot + vy * cz + oy
            rz_p = vz + oz
            positions.extend([rx, ry, rz_p])
            normals.extend([nx, ny, nz])
            uvs.extend([u, v])
        indices.extend([
            v_offset + 0, v_offset + 1, v_offset + 2,
            v_offset + 0, v_offset + 2, v_offset + 3
        ])
        v_offset += 4

    return positions, normals, uvs, indices


def combine_submeshes(boxes):
    all_pos, all_norm, all_uv, all_idx = [], [], [], []
    v_base = 0
    for b in boxes:
        pos, norm, uv, idx = make_box_geometry(*b)
        all_pos.extend(pos)
        all_norm.extend(norm)
        all_uv.extend(uv)
        all_idx.extend([i + v_base for i in idx])
        v_base += len(pos) // 3
    return all_pos, all_norm, all_uv, all_idx


def build_glb():
    parts = {
        "head": [
            (0.215, 0.250, 0.215, 0.0, 0.0, 0.0, 0.0),
            (0.221, 0.038, 0.221, 0.0, 0.122, 0.0, 0.0),
            (0.112, 0.075, 0.112, 0.0, -0.145, 0.0, 0.0),
        ],
        "upperTorso": [
            (0.320, 0.155, 0.195, 0.0, 0.065, 0.0, 0.0),
            (0.270, 0.130, 0.180, 0.0, -0.065, 0.0, 0.0),
            (0.088, 0.115, 0.182, -0.178, 0.058, 0.0, 0.22),
            (0.088, 0.115, 0.182, 0.178, 0.058, 0.0, -0.22),
        ],
        "abdomen": [
            (0.230, 0.130, 0.165, 0.0, 0.055, 0.0, 0.0),
            (0.135, 0.120, 0.172, 0.0, -0.065, 0.0, 0.0),
            (0.105, 0.115, 0.170, -0.085, -0.050, 0.0, 0.0),
            (0.105, 0.115, 0.170, 0.085, -0.050, 0.0, 0.0),
        ],
        "upperArmL": [
            (0.104, 0.235, 0.104, 0.0, 0.0, 0.0, 0.08),
        ],
        "upperArmR": [
            (0.104, 0.235, 0.104, 0.0, 0.0, 0.0, -0.08),
        ],
        "forearmL": [
            (0.090, 0.210, 0.090, 0.0, 0.0, 0.0, 0.0),
            (0.094, 0.082, 0.094, 0.0, -0.118, 0.0, 0.0),
            (0.078, 0.068, 0.082, 0.012, -0.178, 0.0, -0.24),
        ],
        "forearmR": [
            (0.090, 0.210, 0.090, 0.0, 0.0, 0.0, 0.0),
            (0.094, 0.082, 0.094, 0.0, -0.118, 0.0, 0.0),
            (0.078, 0.068, 0.082, -0.012, -0.178, 0.0, 0.24),
        ],
        "thighL": [
            (0.110, 0.340, 0.118, 0.0, 0.0, 0.0, 0.0),
        ],
        "thighR": [
            (0.110, 0.340, 0.118, 0.0, 0.0, 0.0, 0.0),
        ],
        "calfL": [
            (0.096, 0.275, 0.104, 0.0, 0.0, 0.0, 0.0),
            (0.108, 0.095, 0.118, 0.0, -0.115, 0.005, 0.0),
            (0.116, 0.075, 0.175, 0.0, -0.172, 0.028, 0.0),
        ],
        "calfR": [
            (0.096, 0.275, 0.104, 0.0, 0.0, 0.0, 0.0),
            (0.108, 0.095, 0.118, 0.0, -0.115, 0.005, 0.0),
            (0.116, 0.075, 0.175, 0.0, -0.172, 0.028, 0.0),
        ],
    }

    bin_data = bytearray()
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []

    def add_buffer_view(raw_bytes, target):
        while len(bin_data) % 4 != 0:
            bin_data.append(0)
        offset = len(bin_data)
        bin_data.extend(raw_bytes)
        bv_idx = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(raw_bytes),
            "target": target
        })
        return bv_idx

    for name, boxes in parts.items():
        pos, norm, uv, idx = combine_submeshes(boxes)
        v_count = len(pos) // 3

        pos_bytes = struct.pack(f"<{len(pos)}f", *pos)
        norm_bytes = struct.pack(f"<{len(norm)}f", *norm)
        uv_bytes = struct.pack(f"<{len(uv)}f", *uv)
        idx_bytes = struct.pack(f"<{len(idx)}H", *idx)

        xs = pos[0::3]
        ys = pos[1::3]
        zs = pos[2::3]

        bv_pos = add_buffer_view(pos_bytes, 34962)
        acc_pos = len(accessors)
        accessors.append({
            "bufferView": bv_pos,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC3",
            "min": [min(xs), min(ys), min(zs)],
            "max": [max(xs), max(ys), max(zs)]
        })

        bv_norm = add_buffer_view(norm_bytes, 34962)
        acc_norm = len(accessors)
        accessors.append({
            "bufferView": bv_norm,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC3"
        })

        bv_uv = add_buffer_view(uv_bytes, 34962)
        acc_uv = len(accessors)
        accessors.append({
            "bufferView": bv_uv,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC2"
        })

        bv_idx = add_buffer_view(idx_bytes, 34963)
        acc_idx = len(accessors)
        accessors.append({
            "bufferView": bv_idx,
            "componentType": 5123,
            "count": len(idx),
            "type": "SCALAR"
        })

        mesh_idx = len(meshes)
        meshes.append({
            "name": name,
            "primitives": [{
                "attributes": {
                    "POSITION": acc_pos,
                    "NORMAL": acc_norm,
                    "TEXCOORD_0": acc_uv
                },
                "indices": acc_idx
            }]
        })
        nodes.append({"name": name, "mesh": mesh_idx})

    while len(bin_data) % 4 != 0:
        bin_data.append(0)

    gltf = {
        "asset": {"version": "2.0", "generator": "GoreBox-Goredoll-Builder"},
        "scene": 0,
        "scenes": [{"name": "GoreDoll", "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_data)}]
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_GLB, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_data), 0x004E4942))
        f.write(bin_data)

    print(f"Built {OUT_GLB} ({total_len} bytes)")


if __name__ == "__main__":
    build_glb()
