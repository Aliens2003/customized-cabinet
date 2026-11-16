"""Generate and validate printable solids from the same parameters as the viewer."""
from io import BytesIO
from math import isfinite
from pathlib import Path
from shutil import which
from struct import iter_unpack, unpack_from
from subprocess import run
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
import os

ROOT = Path(__file__).resolve().parent.parent
LIMITS = {
    "width": (120, 256, 1),
    "depth": (100, 256, 1),
    "height": (100, 256, 1),
    "wall": (2, 8, 1),
    "hex_flat": (8, 18, 1),
    "hex_web": (2, 4, 0.2),
    "frame": (6, 22, 1),
    "rail_projection": (2, 20, 0.5),
    "rail_thickness": (1, 7, 0.5),
}


def design(data):
    if not isinstance(data, dict) or data.keys() != LIMITS.keys():
        raise ValueError("导出参数不完整，请刷新页面后重试。")
    for key, (minimum, maximum, step) in LIMITS.items():
        value = data[key]
        if type(value) not in (int, float) or not minimum <= value <= maximum:
            raise ValueError(f"参数超出范围：{key}")
        units = (value - minimum) / step
        if abs(units - round(units)) > 1e-8:
            raise ValueError(f"参数步长不正确：{key}")
    top = data["wall"] + 1
    if data["frame"] < top:
        raise ValueError("边框宽度须至少等于顶板厚度。")
    growth = (data["height"] - 180) / 2
    drawer_growth = growth - (data["wall"] - 4)
    return {
        **data, "top_thickness": top, "upper_level": 90 + growth,
        "face_height": 84 + drawer_growth, "tray_height": 78 + drawer_growth,
    }


def validate_stl(data, expected):
    triangles = unpack_from("<I", data, 80)[0] if len(data) >= 84 else 0
    if not triangles or len(data) != 84 + 50 * triangles:
        raise RuntimeError("OpenSCAD 未生成完整的二进制 STL。")
    edges = {}
    parents = list(range(triangles))

    def root(index):
        while index != parents[index]:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for index, record in enumerate(iter_unpack("<12fH", data[84:])):
        points = [tuple(record[i:i+3]) for i in (3, 6, 9)]
        if len(set(points)) != 3 or not all(map(isfinite, record[3:12])):
            raise RuntimeError("STL 含有无效三角面。")
        for point in points:
            for axis, value in enumerate(point):
                mins[axis] = min(mins[axis], value)
                maxs[axis] = max(maxs[axis], value)
        for start, end in zip(points, points[1:] + points[:1]):
            key = tuple(sorted((start, end)))
            if key not in edges:
                edges[key] = (index, start)
                continue
            previous = edges[key]
            if previous is None or previous[1] == start:
                raise RuntimeError("STL 含有非流形边或面朝向错误。")
            parents[root(index)] = root(previous[0])
            edges[key] = None
    if any(edge is not None for edge in edges.values()) or len({root(i) for i in range(triangles)}) != 1:
        raise RuntimeError("STL 未形成一个封闭连通实体。")
    if any(abs(lo) > 0.02 or abs(hi - lo - size) > 0.02 for lo, hi, size in zip(mins, maxs, expected)):
        raise RuntimeError("STL 尺寸或落板位置与参数不符。")


def export_stl(data):
    settings = design(data)
    openscad = os.environ.get("OPENSCAD_PATH") or which("openscad.com") or which("openscad")
    installed = Path("G:/App/OpenSCAD/openscad.com")
    if not openscad and installed.is_file():
        openscad = str(installed)
    if not openscad:
        raise RuntimeError("找不到 OpenSCAD。请将其加入 PATH 或设置 OPENSCAD_PATH，再重启预览服务。")
    definitions = [arg for key, value in settings.items() for arg in ("-D", f"{key}={value}")]
    width, depth, height, wall = (settings[key] for key in ("width", "depth", "height", "wall"))
    parts = [
        ("shell_print", "cabinet-shell.stl", (width, height, depth)),
        ("drawer", "cabinet-drawer.stl", (width - 2 * (wall + 1), depth - wall - 2, settings["face_height"])),
    ]
    output = BytesIO()
    with TemporaryDirectory(prefix="cabinet-stl-") as temporary, ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for part, name, size in parts:
            target = Path(temporary) / name
            result = run(
                [openscad, "--export-format", "binstl", "-o", str(target), *definitions,
                 "-D", f'part="{part}"', str(ROOT / "cabinet.scad")],
                capture_output=True, timeout=600, check=False,
            )
            if result.returncode or not target.exists() or b"ERROR:" in result.stderr:
                print(result.stderr.decode(errors="replace"), flush=True)
                raise RuntimeError(f"OpenSCAD 无法生成 {name}。")
            mesh = target.read_bytes()
            validate_stl(mesh, size)
            archive.writestr(name, mesh)
    return output.getvalue()
