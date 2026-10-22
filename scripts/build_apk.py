#!/usr/bin/env python3
"""
Builds a genuine, self-contained, signed Android APK (mezhdugorny-gorebox.apk)
for "МЕЖДУГОРНЫЙ // GoreBox Android Edition" containing:
  1. Valid Binary XML AndroidManifest.xml (RES_XML_TYPE 0x0003)
  2. Valid Dalvik Executable classes.dex (MainActivity with hardware-accelerated WebView)
  3. Valid Binary Resource Table resources.arsc (4-byte aligned, uncompressed)
  4. High-res app icon res/drawable/icon.png + PWA icons
  5. Complete self-contained 3D WebGL game in assets/index.html (inlined JS + CSS from Vite build)
  6. Dual APK Signing: JAR v1 (META-INF/MANIFEST.MF, CERT.SF, CERT.RSA) + APK Signature Scheme v2 Block
"""

import base64
import glob
import hashlib
import math
import os
import struct
import subprocess
import tempfile
import zlib
import zipfile

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT_DIR, "dist")
PUBLIC_DIR = os.path.join(ROOT_DIR, "public")
os.makedirs(PUBLIC_DIR, exist_ok=True)


# ============================================================================
# 1. Generate PNG App Icons (GoreBox / Mezhdugorny Tactical Emblem)
# ============================================================================
def create_png_icon(size: int) -> bytes:
    """Generates a valid RGBA PNG icon of given size using pure Python zlib/struct."""
    width = height = size
    raw_rows = bytearray()
    cx = cy = size / 2.0
    r_outer = size * 0.44
    r_inner = size * 0.32

    for y in range(height):
        raw_rows.append(0)  # Filter type 0 (None)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)

            # Dark steel rounded background
            bg_r, bg_g, bg_b, bg_a = 12, 17, 26, 255

            # Outer crimson GoreBox ring
            if r_inner < dist <= r_outer:
                bg_r, bg_g, bg_b = 220, 38, 38
            elif dist <= r_inner:
                bg_r, bg_g, bg_b = 20, 29, 43

            # Crosshair lines
            if (abs(dx) < size * 0.035 and abs(dy) < r_outer * 1.05) or (
                abs(dy) < size * 0.035 and abs(dx) < r_outer * 1.05
            ):
                if dist > size * 0.12:
                    bg_r, bg_g, bg_b = 248, 250, 252

            # Center glowing red core dot
            if dist < size * 0.075:
                bg_r, bg_g, bg_b = 239, 68, 68

            raw_rows.extend((bg_r, bg_g, bg_b, bg_a))

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw_rows), 9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )


# ============================================================================
# 2. Build Binary AndroidManifest.xml (AXML Format)
# ============================================================================
def build_binary_android_manifest() -> bytes:
    """
    Constructs a valid Android Binary XML (AXML) AndroidManifest.xml.
    """
    # Resource-mapped attribute names MUST come first in the String Pool, sorted by ID
    attr_specs = [
        ("theme", 0x01010000),
        ("label", 0x01010001),
        ("icon", 0x01010002),
        ("name", 0x01010003),
        ("exported", 0x01010010),
        ("screenOrientation", 0x0101001E),
        ("configChanges", 0x0101001F),
        ("minSdkVersion", 0x0101020C),
        ("versionCode", 0x0101021B),
        ("versionName", 0x0101021C),
        ("targetSdkVersion", 0x01010270),
        ("hardwareAccelerated", 0x010102D3),
    ]

    extra_strings = [
        "http://schemas.android.com/apk/res/android",
        "android",
        "",
        "manifest",
        "package",
        "com.mezhdugorny.gorebox",
        "1.0.0-android",
        "uses-permission",
        "android.permission.INTERNET",
        "uses-sdk",
        "application",
        "Междугорный: GoreBox",
        "activity",
        "com.mezhdugorny.gorebox.MainActivity",
        "intent-filter",
        "action",
        "android.intent.action.MAIN",
        "category",
        "android.intent.category.LAUNCHER",
    ]

    all_strings = [a[0] for a in attr_specs] + extra_strings
    str_idx = {s: i for i, s in enumerate(all_strings)}

    # Build UTF-16LE String Pool chunk (0x0001)
    encoded_strings = []
    offsets = []
    cur_offset = 0
    for s in all_strings:
        u16 = s.encode("utf-16le")
        char_len = len(s)
        entry = struct.pack("<H", char_len) + u16 + b"\x00\x00"
        offsets.append(cur_offset)
        encoded_strings.append(entry)
        cur_offset += len(entry)

    strings_blob = b"".join(encoded_strings)
    while len(strings_blob) % 4 != 0:
        strings_blob += b"\x00"

    string_count = len(all_strings)
    strings_start = 28 + string_count * 4
    pool_size = strings_start + len(strings_blob)
    string_pool_chunk = (
        struct.pack(
            "<HHIIIIII",
            0x0001,  # RES_STRING_POOL_TYPE
            28,      # header size
            pool_size,
            string_count,
            0,       # style count
            0,       # flags (UTF-16)
            strings_start,
            0,       # styles start
        )
        + b"".join(struct.pack("<I", o) for o in offsets)
        + strings_blob
    )

    # Build Resource ID Map chunk (0x0180)
    res_ids = [a[1] for a in attr_specs]
    res_map_size = 8 + len(res_ids) * 4
    res_map_chunk = struct.pack("<HHI", 0x0180, 8, res_map_size) + b"".join(
        struct.pack("<I", rid) for rid in res_ids
    )

    NS_URI = str_idx["http://schemas.android.com/apk/res/android"]
    NS_PREFIX = str_idx["android"]
    NO_NS = 0xFFFFFFFF

    # TypedValue types
    TYPE_NULL = 0x00
    TYPE_REFERENCE = 0x01
    TYPE_STRING = 0x03
    TYPE_INT_DEC = 0x10
    TYPE_INT_HEX = 0x11
    TYPE_INT_BOOLEAN = 0x12

    def make_attr(ns_idx, name_str, raw_str, val_type, val_data):
        name_i = str_idx[name_str]
        raw_i = str_idx[raw_str] if raw_str is not None else 0xFFFFFFFF
        return struct.pack(
            "<IIIHBBI",
            ns_idx,
            name_i,
            raw_i,
            8,         # size of Res_value
            0,         # res0
            val_type,
            val_data & 0xFFFFFFFF,
        )

    def start_element(tag_name, attrs, line=1):
        attr_bytes = b"".join(attrs)
        total = 36 + len(attr_bytes)
        return (
            struct.pack(
                "<HHIIIIIHHHHHH",
                0x0102,  # RES_XML_START_ELEMENT_TYPE
                16,
                total,
                line,
                0xFFFFFFFF,
                NO_NS,
                str_idx[tag_name],
                0x0014,  # attributeStart
                0x0014,  # attributeSize (20 bytes)
                len(attrs),
                0,
                0,
                0,
            )
            + attr_bytes
        )

    def end_element(tag_name, line=1):
        return struct.pack(
            "<HHIIIII",
            0x0103,  # RES_XML_END_ELEMENT_TYPE
            16,
            24,
            line,
            0xFFFFFFFF,
            NO_NS,
            str_idx[tag_name],
        )

    start_ns = struct.pack(
        "<HHIIIII", 0x0100, 16, 24, 1, 0xFFFFFFFF, NS_PREFIX, NS_URI
    )
    end_ns = struct.pack(
        "<HHIIIII", 0x0101, 16, 24, 1, 0xFFFFFFFF, NS_PREFIX, NS_URI
    )

    xml_chunks = [
        start_ns,
        # <manifest package="com.mezhdugorny.gorebox" android:versionCode="100" android:versionName="1.0.0-android">
        start_element(
            "manifest",
            [
                make_attr(NS_URI, "versionCode", None, TYPE_INT_DEC, 100),
                make_attr(
                    NS_URI,
                    "versionName",
                    "1.0.0-android",
                    TYPE_STRING,
                    str_idx["1.0.0-android"],
                ),
                make_attr(
                    NO_NS,
                    "package",
                    "com.mezhdugorny.gorebox",
                    TYPE_STRING,
                    str_idx["com.mezhdugorny.gorebox"],
                ),
            ],
            line=2,
        ),
        # <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33" />
        start_element(
            "uses-sdk",
            [
                make_attr(NS_URI, "minSdkVersion", None, TYPE_INT_DEC, 21),
                make_attr(NS_URI, "targetSdkVersion", None, TYPE_INT_DEC, 33),
            ],
            line=3,
        ),
        end_element("uses-sdk", line=3),
        # <uses-permission android:name="android.permission.INTERNET" />
        start_element(
            "uses-permission",
            [
                make_attr(
                    NS_URI,
                    "name",
                    "android.permission.INTERNET",
                    TYPE_STRING,
                    str_idx["android.permission.INTERNET"],
                )
            ],
            line=4,
        ),
        end_element("uses-permission", line=4),
        # <application android:theme="@android:style/Theme.NoTitleBar.Fullscreen" android:label="..." android:icon="@0x7f010000" android:hardwareAccelerated="true">
        start_element(
            "application",
            [
                make_attr(NS_URI, "theme", None, TYPE_REFERENCE, 0x01030007),
                make_attr(
                    NS_URI,
                    "label",
                    "Междугорный: GoreBox",
                    TYPE_STRING,
                    str_idx["Междугорный: GoreBox"],
                ),
                make_attr(NS_URI, "icon", None, TYPE_REFERENCE, 0x7F010000),
                make_attr(NS_URI, "hardwareAccelerated", None, TYPE_INT_BOOLEAN, 0xFFFFFFFF),
            ],
            line=5,
        ),
        # <activity android:name="com.mezhdugorny.gorebox.MainActivity" android:exported="true" android:screenOrientation="6" android:configChanges="0x04a0">
        start_element(
            "activity",
            [
                make_attr(
                    NS_URI,
                    "name",
                    "com.mezhdugorny.gorebox.MainActivity",
                    TYPE_STRING,
                    str_idx["com.mezhdugorny.gorebox.MainActivity"],
                ),
                make_attr(NS_URI, "exported", None, TYPE_INT_BOOLEAN, 0xFFFFFFFF),
                make_attr(NS_URI, "screenOrientation", None, TYPE_INT_DEC, 6),  # sensorLandscape
                make_attr(NS_URI, "configChanges", None, TYPE_INT_HEX, 0x04A0),
            ],
            line=6,
        ),
        # <intent-filter>
        start_element("intent-filter", [], line=7),
        start_element(
            "action",
            [
                make_attr(
                    NS_URI,
                    "name",
                    "android.intent.action.MAIN",
                    TYPE_STRING,
                    str_idx["android.intent.action.MAIN"],
                )
            ],
            line=8,
        ),
        end_element("action", line=8),
        start_element(
            "category",
            [
                make_attr(
                    NS_URI,
                    "name",
                    "android.intent.category.LAUNCHER",
                    TYPE_STRING,
                    str_idx["android.intent.category.LAUNCHER"],
                )
            ],
            line=9,
        ),
        end_element("category", line=9),
        end_element("intent-filter", line=10),
        end_element("activity", line=11),
        end_element("application", line=12),
        end_element("manifest", line=13),
        end_ns,
    ]

    body = string_pool_chunk + res_map_chunk + b"".join(xml_chunks)
    header = struct.pack("<HHI", 0x0003, 8, 8 + len(body))
    return header + body


# ============================================================================
# 3. Build Binary Resource Table resources.arsc (Defines @0x7f010000 -> res/drawable/icon.png)
# ============================================================================
def build_resources_arsc() -> bytes:
    """
    Constructs a valid RES_TABLE_TYPE (0x0002) resources.arsc mapping
    0x7f010000 (drawable/icon) -> "res/drawable/icon.png".
    """
    def make_string_pool(strings):
        enc = []
        offs = []
        cur = 0
        for s in strings:
            u16 = s.encode("utf-16le")
            e = struct.pack("<H", len(s)) + u16 + b"\x00\x00"
            offs.append(cur)
            enc.append(e)
            cur += len(e)
        blob = b"".join(enc)
        while len(blob) % 4 != 0:
            blob += b"\x00"
        start = 28 + len(strings) * 4
        size = start + len(blob)
        return (
            struct.pack("<HHIIIIII", 0x0001, 28, size, len(strings), 0, 0, start, 0)
            + b"".join(struct.pack("<I", o) for o in offs)
            + blob
        )

    global_pool = make_string_pool(["res/drawable/icon.png"])
    type_pool = make_string_pool(["drawable"])
    key_pool = make_string_pool(["icon"])

    # RES_TABLE_TYPE_SPEC_TYPE (0x0202) for type id 1 (drawable), 1 entry
    type_spec = struct.pack("<HHIBBHI", 0x0202, 16, 20, 1, 0, 0, 1) + struct.pack("<I", 0)

    # RES_TABLE_TYPE_TYPE (0x0201) for type id 1, 1 entry pointing to global string 0 ("res/drawable/icon.png")
    entry_data = struct.pack("<HHI", 8, 0, 0) + struct.pack("<HBBI", 8, 0, 0x03, 0)
    # ResTable_config (48 bytes all zeros)
    config = struct.pack("<I", 48) + b"\x00" * 44
    type_header_size = 20 + len(config)  # 68 bytes
    entries_start = type_header_size + 4
    type_chunk_size = entries_start + len(entry_data)
    type_chunk = (
        struct.pack("<HHIBBHII", 0x0201, type_header_size, type_chunk_size, 1, 0, 0, 1, entries_start)
        + config
        + struct.pack("<I", 0)
        + entry_data
    )

    # Package name UTF-16LE fixed 128 chars (256 bytes)
    pkg_name = "com.mezhdugorny.gorebox".encode("utf-16le").ljust(256, b"\x00")
    pkg_header_size = 288
    type_strings_offset = pkg_header_size
    key_strings_offset = pkg_header_size + len(type_pool)
    pkg_body = type_pool + key_pool + type_spec + type_chunk
    pkg_total_size = pkg_header_size + len(pkg_body)

    pkg_header = (
        struct.pack("<HHII", 0x0200, pkg_header_size, pkg_total_size, 0x7F)
        + pkg_name
        + struct.pack("<IIIII", type_strings_offset, 1, key_strings_offset, 1, 0)
    )
    pkg_chunk = pkg_header + pkg_body

    total_size = 12 + len(global_pool) + len(pkg_chunk)
    table_header = struct.pack("<HHII", 0x0002, 12, total_size, 1)
    return table_header + global_pool + pkg_chunk


# ============================================================================
# 4. Build Valid Dalvik Executable classes.dex (MainActivity with WebView)
# ============================================================================
def build_classes_dex() -> bytes:
    """
    Constructs a 100% valid Dalvik Executable (classes.dex, version 035)
    implementing com.mezhdugorny.gorebox.MainActivity extends android.app.Activity:
      - <init>()V
      - onCreate(Landroid/os/Bundle;)V -> creates WebView, enables JS & DOMStorage,
        loads "file:///android_asset/index.html", calls setContentView(webView).
    """
    # Sorted UTF-8 strings required by DEX format specification
    strings = sorted(
        [
            "<init>",
            "L",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Lcom/mezhdugorny/gorebox/MainActivity;",
            "V",
            "VL",
            "VZ",
            "Z",
            "file:///android_asset/index.html",
            "getSettings",
            "loadUrl",
            "onCreate",
            "setAllowFileAccess",
            "setContentView",
            "setDomStorageEnabled",
            "setJavaScriptEnabled",
        ]
    )
    s_idx = {s: i for i, s in enumerate(strings)}

    # Types (sorted by string index)
    type_names = sorted(
        [
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Lcom/mezhdugorny/gorebox/MainActivity;",
            "V",
            "Z",
        ],
        key=lambda t: s_idx[t],
    )
    t_idx = {t: i for i, t in enumerate(type_names)}

    def uleb128(val: int) -> bytes:
        out = bytearray()
        while True:
            b = val & 0x7F
            val >>= 7
            if val:
                out.append(b | 0x80)
            else:
                out.append(b)
                break
        return bytes(out)

    # Type Lists for method prototypes
    # Proto 0: ()V -> no params
    # Proto 1: ()Landroid/webkit/WebSettings; -> no params
    # Proto 2: (Landroid/content/Context;)V -> [Context]
    # Proto 3: (Landroid/os/Bundle;)V -> [Bundle]
    # Proto 4: (Landroid/view/View;)V -> [View]
    # Proto 5: (Ljava/lang/String;)V -> Wait: let's include Ljava/lang/String; in strings & types!
    return _build_complete_dex_with_string_type(uleb128)


def _build_complete_dex_with_string_type(uleb128) -> bytes:
    strings = sorted(
        [
            "<init>",
            "L",
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Lcom/mezhdugorny/gorebox/MainActivity;",
            "Ljava/lang/String;",
            "V",
            "VL",
            "VZ",
            "Z",
            "file:///android_asset/index.html",
            "getSettings",
            "loadUrl",
            "onCreate",
            "setAllowFileAccess",
            "setContentView",
            "setDomStorageEnabled",
            "setJavaScriptEnabled",
        ]
    )
    s_idx = {s: i for i, s in enumerate(strings)}

    type_names = sorted(
        [
            "Landroid/app/Activity;",
            "Landroid/content/Context;",
            "Landroid/os/Bundle;",
            "Landroid/view/View;",
            "Landroid/webkit/WebSettings;",
            "Landroid/webkit/WebView;",
            "Lcom/mezhdugorny/gorebox/MainActivity;",
            "Ljava/lang/String;",
            "V",
            "Z",
        ],
        key=lambda t: s_idx[t],
    )
    t_idx = {t: i for i, t in enumerate(type_names)}

    # Protos: (shorty_idx, return_type_idx, param_type_list_key)
    proto_defs = [
        ("L", "Landroid/webkit/WebSettings;", ()),
        ("V", "V", ()),
        ("VL", "V", ("Landroid/content/Context;",)),
        ("VL", "V", ("Landroid/os/Bundle;",)),
        ("VL", "V", ("Landroid/view/View;",)),
        ("VL", "V", ("Ljava/lang/String;",)),
        ("VZ", "V", ("Z",)),
    ]
    # Sort protos by return_type then params
    proto_defs.sort(key=lambda p: (t_idx[p[1]], [t_idx[x] for x in p[2]]))
    p_idx = {(p[1], p[2]): i for i, p in enumerate(proto_defs)}

    # Methods: (class_type, proto_key, name_str)
    method_defs = [
        ("Landroid/app/Activity;", ("V", ()), "<init>"),
        ("Landroid/app/Activity;", ("V", ("Landroid/os/Bundle;",)), "onCreate"),
        ("Landroid/app/Activity;", ("V", ("Landroid/view/View;",)), "setContentView"),
        ("Landroid/webkit/WebSettings;", ("V", ("Z",)), "setAllowFileAccess"),
        ("Landroid/webkit/WebSettings;", ("V", ("Z",)), "setDomStorageEnabled"),
        ("Landroid/webkit/WebSettings;", ("V", ("Z",)), "setJavaScriptEnabled"),
        ("Landroid/webkit/WebView;", ("V", ("Landroid/content/Context;",)), "<init>"),
        ("Landroid/webkit/WebView;", ("Landroid/webkit/WebSettings;", ()), "getSettings"),
        ("Landroid/webkit/WebView;", ("V", ("Ljava/lang/String;",)), "loadUrl"),
        ("Lcom/mezhdugorny/gorebox/MainActivity;", ("V", ()), "<init>"),
        ("Lcom/mezhdugorny/gorebox/MainActivity;", ("V", ("Landroid/os/Bundle;",)), "onCreate"),
    ]
    method_defs.sort(key=lambda m: (t_idx[m[0]], s_idx[m[2]], p_idx[m[1]]))
    m_idx = {(m[0], m[2], m[1]): i for i, m in enumerate(method_defs)}

    # Layout fixed offsets
    header_off = 0x00
    string_ids_off = 0x70
    type_ids_off = string_ids_off + len(strings) * 4
    proto_ids_off = type_ids_off + len(type_names) * 4
    method_ids_off = proto_ids_off + len(proto_defs) * 12
    class_defs_off = method_ids_off + len(method_defs) * 8
    data_off = class_defs_off + 32  # 1 class_def_item = 32 bytes

    data_buf = bytearray()

    def align4():
        while (data_off + len(data_buf)) % 4 != 0:
            data_buf.append(0)

    # 1. Type Lists in data section
    align4()
    type_list_offsets = {}
    unique_param_tuples = []
    for _, _, params in proto_defs:
        if params and params not in unique_param_tuples:
            unique_param_tuples.append(params)

    for params in unique_param_tuples:
        align4()
        type_list_offsets[params] = data_off + len(data_buf)
        data_buf.extend(struct.pack("<I", len(params)))
        for pt in params:
            data_buf.extend(struct.pack("<H", t_idx[pt]))

    # 2. Code Items in data section
    # Code 1: MainActivity.<init>()V
    #   invoke-direct {p0}, Landroid/app/Activity;-><init>()V  (70 10 m_id 00 00)
    #   return-void                                           (0e 00)
    align4()
    code_init_off = data_off + len(data_buf)
    m_act_init = m_idx[("Landroid/app/Activity;", "<init>", ("V", ()))]
    insns_init = struct.pack("<HHH", 0x1070, m_act_init, 0x0000) + struct.pack("<H", 0x000E)
    data_buf.extend(
        struct.pack("<HHHHII", 1, 1, 1, 0, 0, len(insns_init) // 2) + insns_init
    )

    # Code 2: MainActivity.onCreate(Landroid/os/Bundle;)V
    # Registers: v0 (WebView), v1 (WebSettings / String / bool), v2 (this = p0), v3 (bundle = p1)
    align4()
    code_oncreate_off = data_off + len(data_buf)
    m_super_oncreate = m_idx[("Landroid/app/Activity;", "onCreate", ("V", ("Landroid/os/Bundle;",)))]
    m_wv_init = m_idx[("Landroid/webkit/WebView;", "<init>", ("V", ("Landroid/content/Context;",)))]
    m_wv_getset = m_idx[("Landroid/webkit/WebView;", "getSettings", ("Landroid/webkit/WebSettings;", ()))]
    m_ws_js = m_idx[("Landroid/webkit/WebSettings;", "setJavaScriptEnabled", ("V", ("Z",)))]
    m_ws_dom = m_idx[("Landroid/webkit/WebSettings;", "setDomStorageEnabled", ("V", ("Z",)))]
    m_ws_file = m_idx[("Landroid/webkit/WebSettings;", "setAllowFileAccess", ("V", ("Z",)))]
    m_act_setcv = m_idx[("Landroid/app/Activity;", "setContentView", ("V", ("Landroid/view/View;",)))]
    m_wv_load = m_idx[("Landroid/webkit/WebView;", "loadUrl", ("V", ("Ljava/lang/String;",)))]

    insns_oncreate = b"".join(
        [
            # invoke-super {v2, v3}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V
            struct.pack("<HHH", 0x206F, m_super_oncreate, 0x0032),
            # new-instance v0, Landroid/webkit/WebView;
            struct.pack("<HH", 0x0022, t_idx["Landroid/webkit/WebView;"]),
            # invoke-direct {v0, v2}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
            struct.pack("<HHH", 0x2070, m_wv_init, 0x0020),
            # invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
            struct.pack("<HHH", 0x106E, m_wv_getset, 0x0000),
            # move-result-object v1
            struct.pack("<H", 0x010C),
            # const/4 v3, #int 1
            struct.pack("<H", 0x1312),
            # invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
            struct.pack("<HHH", 0x206E, m_ws_js, 0x0031),
            # invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
            struct.pack("<HHH", 0x206E, m_ws_dom, 0x0031),
            # invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
            struct.pack("<HHH", 0x206E, m_ws_file, 0x0031),
            # invoke-virtual {v2, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V
            struct.pack("<HHH", 0x206E, m_act_setcv, 0x0002),
            # const-string v1, "file:///android_asset/index.html"
            struct.pack("<HH", 0x011A, s_idx["file:///android_asset/index.html"]),
            # invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
            struct.pack("<HHH", 0x206E, m_wv_load, 0x0010),
            # return-void
            struct.pack("<H", 0x000E),
        ]
    )
    data_buf.extend(
        struct.pack("<HHHHII", 4, 2, 2, 0, 0, len(insns_oncreate) // 2) + insns_oncreate
    )

    # 3. String Data Items in data section
    string_data_offsets = []
    for s in strings:
        string_data_offsets.append(data_off + len(data_buf))
        raw = s.encode("utf-8")
        data_buf.extend(uleb128(len(s)) + raw + b"\x00")

    # 4. Class Data Item for MainActivity
    class_data_off = data_off + len(data_buf)
    m_my_init = m_idx[("Lcom/mezhdugorny/gorebox/MainActivity;", "<init>", ("V", ()))]
    m_my_oncreate = m_idx[("Lcom/mezhdugorny/gorebox/MainActivity;", "onCreate", ("V", ("Landroid/os/Bundle;",)))]

    class_data_bytes = (
        uleb128(0)  # static_fields_size
        + uleb128(0)  # instance_fields_size
        + uleb128(1)  # direct_methods_size (<init>)
        + uleb128(1)  # virtual_methods_size (onCreate)
        # direct method 0: <init>, ACC_PUBLIC | ACC_CONSTRUCTOR (0x10001)
        + uleb128(m_my_init)
        + uleb128(0x10001)
        + uleb128(code_init_off)
        # virtual method 0: onCreate, ACC_PUBLIC (0x0001)
        + uleb128(m_my_oncreate)
        + uleb128(0x0001)
        + uleb128(code_oncreate_off)
    )
    data_buf.extend(class_data_bytes)

    # 5. Map List at the end of data section
    align4()
    map_off = data_off + len(data_buf)
    map_items = [
        (0x0000, 1, header_off),
        (0x0001, len(strings), string_ids_off),
        (0x0002, len(type_names), type_ids_off),
        (0x0003, len(proto_defs), proto_ids_off),
        (0x0005, len(method_defs), method_ids_off),
        (0x0006, 1, class_defs_off),
        (0x1001, len(unique_param_tuples), type_list_offsets[unique_param_tuples[0]]),
        (0x2001, 2, code_init_off),
        (0x2002, len(strings), string_data_offsets[0]),
        (0x2000, 1, class_data_off),
        (0x1000, 1, map_off),
    ]
    data_buf.extend(struct.pack("<I", len(map_items)))
    for m_type, m_count, m_offset in map_items:
        data_buf.extend(struct.pack("<HHII", m_type, 0, m_count, m_offset))

    align4()
    file_size = data_off + len(data_buf)
    data_size = len(data_buf)

    # Build top-level tables
    string_ids_bytes = b"".join(struct.pack("<I", off) for off in string_data_offsets)
    type_ids_bytes = b"".join(struct.pack("<I", s_idx[t]) for t in type_names)

    proto_ids_bytes = bytearray()
    for shorty, ret_t, params in proto_defs:
        tl_off = type_list_offsets[params] if params else 0
        proto_ids_bytes.extend(
            struct.pack("<III", s_idx[shorty], t_idx[ret_t], tl_off)
        )

    method_ids_bytes = bytearray()
    for c_t, p_key, m_name in method_defs:
        method_ids_bytes.extend(
            struct.pack("<HHI", t_idx[c_t], p_idx[p_key], s_idx[m_name])
        )

    class_defs_bytes = struct.pack(
        "<IIIIIIII",
        t_idx["Lcom/mezhdugorny/gorebox/MainActivity;"],
        0x0001,  # ACC_PUBLIC
        t_idx["Landroid/app/Activity;"],
        0,       # interfaces_off
        0xFFFFFFFF,  # source_file_idx
        0,       # annotations_off
        class_data_off,
        0,       # static_values_off
    )

    header_prefix = struct.pack(
        "<8sI20sIIIIIIIIIIIIIIIIIIII",
        b"dex\n035\x00",
        0,        # checksum placeholder
        b"\x00" * 20,  # SHA-1 placeholder
        file_size,
        0x70,     # header_size
        0x12345678,  # endian_tag
        0,        # link_size
        0,        # link_off
        map_off,
        len(strings),
        string_ids_off,
        len(type_names),
        type_ids_off,
        len(proto_defs),
        proto_ids_off,
        0,        # field_ids_size
        0,        # field_ids_off
        len(method_defs),
        method_ids_off,
        1,        # class_defs_size
        class_defs_off,
        data_size,
        data_off,
    )

    dex_full = bytearray(
        header_prefix
        + string_ids_bytes
        + type_ids_bytes
        + proto_ids_bytes
        + method_ids_bytes
        + class_defs_bytes
        + data_buf
    )

    # Compute SHA-1 signature over bytes [32..]
    sha1_digest = hashlib.sha1(dex_full[32:]).digest()
    dex_full[12:32] = sha1_digest

    # Compute Adler32 checksum over bytes [12..]
    adler = zlib.adler32(dex_full[12:]) & 0xFFFFFFFF
    struct.pack_into("<I", dex_full, 8, adler)

    return bytes(dex_full)


# ============================================================================
# 5. Bundle Vite dist/ into a single self-contained assets/index.html
# ============================================================================
def build_self_contained_game_html() -> bytes:
    """
    Inlines the built CSS and JS from dist/ into a single standalone HTML file
    so Android WebView can run file:///android_asset/index.html 100% offline.
    """
    html_path = os.path.join(DIST_DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    css_files = glob.glob(os.path.join(DIST_DIR, "assets", "*.css"))
    js_files = glob.glob(os.path.join(DIST_DIR, "assets", "*.js"))

    css_content = ""
    for cf in css_files:
        with open(cf, "r", encoding="utf-8") as f:
            css_content += f.read() + "\n"

    js_content = ""
    for jf in js_files:
        with open(jf, "r", encoding="utf-8") as f:
            js_content += f.read() + "\n"

    # Replace external <link rel="stylesheet" ...> and <script type="module" crossorigin src="...">
    import re
    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', f"<style>{css_content}</style>", html)
    html = re.sub(
        r'<script[^>]+src="/assets/[^"]+"[^>]*></script>',
        lambda _: f"<script type=\"module\">{js_content}</script>",
        html,
    )
    return html.encode("utf-8")


# ============================================================================
# 6. Dual APK Signer: JAR Signature v1 + APK Signature Scheme v2 Block
# ============================================================================
def sign_apk_v1_and_v2(unsigned_entries: list, output_apk_path: str):
    """
    Creates a signed APK with:
      - JAR Signature v1 (META-INF/MANIFEST.MF, META-INF/CERT.SF, META-INF/CERT.RSA)
      - 4-byte zipaligned uncompressed resources.arsc
      - APK Signature Scheme v2 Block (ID 0x7109871a) before the ZIP Central Directory
    """
    with tempfile.TemporaryDirectory() as tmp:
        key_pem = os.path.join(tmp, "key.pem")
        cert_pem = os.path.join(tmp, "cert.pem")
        cert_der = os.path.join(tmp, "cert.der")

        # Generate RSA-2048 signing key and self-signed certificate
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                key_pem,
                "-out",
                cert_pem,
                "-days",
                "10000",
                "-subj",
                "/CN=Mezhdugorny GoreBox Studio/O=Mezhdugorny/C=EE",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["openssl", "x509", "-in", cert_pem, "-outform", "DER", "-out", cert_der],
            check=True,
        )
        with open(cert_der, "rb") as f:
            cert_der_bytes = f.read()

        # Extract public key DER (SubjectPublicKeyInfo)
        pubkey_der_path = os.path.join(tmp, "pubkey.der")
        subprocess.run(
            ["openssl", "pkey", "-in", key_pem, "-pubout", "-outform", "DER", "-out", pubkey_der_path],
            check=True,
        )
        with open(pubkey_der_path, "rb") as f:
            pubkey_der_bytes = f.read()

        # 1. Build META-INF/MANIFEST.MF
        mf_lines = [
            "Manifest-Version: 1.0",
            "Created-By: 1.0 (Mezhdugorny GoreBox Android Builder)",
            "",
        ]
        sf_entry_chunks = []

        for name, data, _ in unsigned_entries:
            digest_b64 = base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
            entry_block = f"Name: {name}\r\nSHA-256-Digest: {digest_b64}\r\n\r\n"
            mf_lines.append(entry_block.rstrip("\r\n"))
            mf_lines.append("")

            sf_digest = base64.b64encode(
                hashlib.sha256(entry_block.encode("utf-8")).digest()
            ).decode("ascii")
            sf_entry_chunks.append(f"Name: {name}\r\nSHA-256-Digest: {sf_digest}\r\n\r\n")

        manifest_mf_bytes = "\r\n".join(mf_lines).encode("utf-8")
        mf_main_digest = base64.b64encode(
            hashlib.sha256(manifest_mf_bytes).digest()
        ).decode("ascii")

        cert_sf_str = (
            "Signature-Version: 1.0\r\n"
            "Created-By: 1.0 (Mezhdugorny GoreBox Android Builder)\r\n"
            f"SHA-256-Digest-Manifest: {mf_main_digest}\r\n"
            "X-Android-APK-Signed: 2\r\n\r\n"
            + "".join(sf_entry_chunks)
        )
        cert_sf_bytes = cert_sf_str.encode("utf-8")

        # Sign CERT.SF -> CERT.RSA (PKCS#7 DER detached signature)
        sf_path = os.path.join(tmp, "CERT.SF")
        rsa_path = os.path.join(tmp, "CERT.RSA")
        with open(sf_path, "wb") as f:
            f.write(cert_sf_bytes)

        subprocess.run(
            [
                "openssl",
                "cms",
                "-sign",
                "-binary",
                "-noattr",
                "-in",
                sf_path,
                "-signer",
                cert_pem,
                "-inkey",
                key_pem,
                "-outform",
                "DER",
                "-out",
                rsa_path,
            ],
            check=True,
        )
        with open(rsa_path, "rb") as f:
            cert_rsa_bytes = f.read()

        all_entries = list(unsigned_entries) + [
            ("META-INF/MANIFEST.MF", manifest_mf_bytes, True),
            ("META-INF/CERT.SF", cert_sf_bytes, True),
            ("META-INF/CERT.RSA", cert_rsa_bytes, True),
        ]

        # Write 4-byte zipaligned ZIP archive and capture sections for APK Signature Scheme v2
        zip_path = os.path.join(tmp, "base.apk")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for name, data, compress in all_entries:
                zi = zipfile.ZipInfo(name, date_time=(2026, 10, 22, 12, 0, 0))
                zi.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
                zi.external_attr = 0o644 << 16
                if not compress:
                    # 4-byte zipalign for uncompressed entries (required by Android 11+ for resources.arsc)
                    cur_pos = zf.fp.tell()
                    fname_len = len(name.encode("utf-8"))
                    unaligned_data_start = cur_pos + 30 + fname_len
                    pad = (4 - (unaligned_data_start % 4)) % 4
                    zi.extra = b"\x00" * pad
                zf.writestr(zi, data)

        with open(zip_path, "rb") as f:
            raw_zip = f.read()

        # Locate End of Central Directory (EOCD) & Central Directory (CD)
        eocd_pos = raw_zip.rfind(b"PK\x05\x06")
        cd_size = struct.unpack_from("<I", raw_zip, eocd_pos + 12)[0]
        cd_offset = struct.unpack_from("<I", raw_zip, eocd_pos + 16)[0]

        before_cd = raw_zip[:cd_offset]
        cd_bytes = raw_zip[cd_offset:eocd_pos]
        eocd_bytes = bytearray(raw_zip[eocd_pos:])

        # Build APK Signature Scheme v2 Block over (before_cd, cd_bytes, eocd_bytes)
        v2_block = _build_apk_v2_sig_block(
            before_cd, cd_bytes, bytes(eocd_bytes), key_pem, cert_der_bytes, pubkey_der_bytes, tmp
        )

        # Update EOCD Central Directory offset to account for inserted v2_block
        new_cd_offset = cd_offset + len(v2_block)
        struct.pack_into("<I", eocd_bytes, 16, new_cd_offset)

        with open(output_apk_path, "wb") as out_f:
            out_f.write(before_cd)
            out_f.write(v2_block)
            out_f.write(cd_bytes)
            out_f.write(eocd_bytes)


def _compute_apk_v2_chunk_digests(sections: list) -> bytes:
    """Computes the SHA-256 merkle-like chunk digest per APK Signature Scheme v2 specification."""
    CHUNK_SIZE = 1024 * 1024  # 1 MB
    chunk_digests = []
    for sec in sections:
        offset = 0
        n = len(sec)
        while offset < n:
            chunk = sec[offset : offset + CHUNK_SIZE]
            h = hashlib.sha256()
            h.update(b"\xa5" + struct.pack("<I", len(chunk)))
            h.update(chunk)
            chunk_digests.append(h.digest())
            offset += CHUNK_SIZE

    top = hashlib.sha256()
    top.update(b"\x5a" + struct.pack("<I", len(chunk_digests)))
    for d in chunk_digests:
        top.update(d)
    return top.digest()


def _lp_bytes(b: bytes) -> bytes:
    return struct.pack("<I", len(b)) + b


def _build_apk_v2_sig_block(
    before_cd: bytes,
    cd_bytes: bytes,
    eocd_bytes: bytes,
    key_pem: str,
    cert_der: bytes,
    pubkey_der: bytes,
    tmp_dir: str,
) -> bytes:
    top_digest = _compute_apk_v2_chunk_digests([before_cd, cd_bytes, eocd_bytes])

    # signature algorithm 0x0103 = RSASSA-PKCS1-v1_5 with SHA2-256
    ALG_RSA_PKCS1_SHA256 = 0x0103
    digest_entry = _lp_bytes(struct.pack("<I", ALG_RSA_PKCS1_SHA256) + _lp_bytes(top_digest))
    digests_seq = _lp_bytes(digest_entry)
    certs_seq = _lp_bytes(_lp_bytes(cert_der))
    attrs_seq = _lp_bytes(b"")  # empty additional attributes

    signed_data = digests_seq + certs_seq + attrs_seq

    # Sign signed_data with RSA-SHA256
    sd_path = os.path.join(tmp_dir, "v2_signed_data.bin")
    sig_path = os.path.join(tmp_dir, "v2_sig.bin")
    with open(sd_path, "wb") as f:
        f.write(signed_data)
    subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key_pem, "-out", sig_path, sd_path],
        check=True,
    )
    with open(sig_path, "rb") as f:
        rsa_sig = f.read()

    sig_entry = _lp_bytes(struct.pack("<I", ALG_RSA_PKCS1_SHA256) + _lp_bytes(rsa_sig))
    signatures_seq = _lp_bytes(sig_entry)

    signer = _lp_bytes(_lp_bytes(signed_data) + signatures_seq + _lp_bytes(pubkey_der))
    signers_seq = _lp_bytes(signer)

    # ID-value pair for APK Signature Scheme v2: ID = 0x7109871a
    pair_payload = struct.pack("<I", 0x7109871A) + signers_seq
    id_value_pair = struct.pack("<Q", len(pair_payload)) + pair_payload

    # Pad block so total APK Sig Block size is a multiple of 4096 bytes
    base_size_in_header = 8 + len(id_value_pair) + 16
    remainder = (8 + base_size_in_header) % 4096
    if remainder != 0:
        pad_needed = 4096 - remainder
        if pad_needed >= 12:
            # Add padding ID-value pair (ID = 0x42726577 "VerityPadding")
            pad_payload = struct.pack("<I", 0x42726577) + b"\x00" * (pad_needed - 12)
            id_value_pair += struct.pack("<Q", len(pad_payload)) + pad_payload

    size_of_block = len(id_value_pair) + 8 + 16
    return (
        struct.pack("<Q", size_of_block)
        + id_value_pair
        + struct.pack("<Q", size_of_block)
        + b"APK Sig Block 42"
    )


def main():
    print("1. Generating PNG icons (192x192, 512x512) and PWA manifest...")
    icon_192 = create_png_icon(192)
    icon_512 = create_png_icon(512)

    with open(os.path.join(PUBLIC_DIR, "icon-192.png"), "wb") as f:
        f.write(icon_192)
    with open(os.path.join(PUBLIC_DIR, "icon-512.png"), "wb") as f:
        f.write(icon_512)

    manifest_json = """{
  "name": "МЕЖДУГОРНЫЙ // GoreBox Android Sandbox",
  "short_name": "Междугорный",
  "description": "Тестовый полигон 50x50м: физика регдолла, умный ИИ НПС, 3K PBR текстуры и сенсорное управление в стиле GoreBox.",
  "start_url": "/",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#04060a",
  "theme_color": "#04060a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
"""
    with open(os.path.join(PUBLIC_DIR, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        f.write(manifest_json)

    print("2. Building production Vite bundle...")
    subprocess.run(["npm", "run", "build"], cwd=ROOT_DIR, check=True)

    print("3. Assembling Android APK binary components (AXML, DEX, ARSC, Offline WebGL Bundle)...")
    axml_bytes = build_binary_android_manifest()
    arsc_bytes = build_resources_arsc()
    dex_bytes = build_classes_dex()
    game_html_bytes = build_self_contained_game_html()

    unsigned_entries = [
        ("AndroidManifest.xml", axml_bytes, True),
        ("resources.arsc", arsc_bytes, False),  # Uncompressed per Android spec
        ("classes.dex", dex_bytes, True),
        ("res/drawable/icon.png", icon_192, False),
        ("assets/index.html", game_html_bytes, True),
    ]

    models_dir = os.path.join(PUBLIC_DIR, "models")
    if os.path.isdir(models_dir):
        for fname in sorted(os.listdir(models_dir)):
            if fname.endswith((".glb", ".jpg")):
                fpath = os.path.join(models_dir, fname)
                with open(fpath, "rb") as mf:
                    unsigned_entries.append((f"assets/models/{fname}", mf.read(), True))

    apk_out_public = os.path.join(PUBLIC_DIR, "mezhdugorny-gorebox.apk")
    apk_out_dist = os.path.join(DIST_DIR, "mezhdugorny-gorebox.apk")

    print("4. Signing APK with RSA-2048 (JAR v1 + APK Signature Scheme v2)...")
    sign_apk_v1_and_v2(unsigned_entries, apk_out_public)

    if os.path.isdir(DIST_DIR):
        with open(apk_out_public, "rb") as src, open(apk_out_dist, "wb") as dst:
            dst.write(src.read())

    apk_size_kb = os.path.getsize(apk_out_public) / 1024.0
    print(f"SUCCESS! Built signed Android APK: {apk_out_public} ({apk_size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
