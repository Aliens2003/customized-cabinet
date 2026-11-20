# 蜂窝双抽屉柜

带实心顶板的参数化双抽屉柜。底板、两侧和背板保留蜂窝，左右两条内置滑轨支撑上层抽屉。外壳打印 1 件，两只抽屉使用同一个模型。

[打开在线预览与 STL 导出](https://aliens2003.github.io/customized-cabinet/viewer/)

## 调整尺寸

拖动模型可旋转，滚轮可缩放。手机上用单指旋转、双指缩放。页面提供等轴、正面、右侧、俯视和爆炸视图，也可分别拉开上下抽屉。

| 参数 | 默认值 | 调节范围 |
| --- | --- | --- |
| 柜体宽度 | 250 mm | 30–256 mm |
| 柜体深度 | 235 mm | 30–256 mm |
| 柜体高度 | 180 mm | 30–256 mm |
| 柜体壁厚 | 4 mm | 2–8 mm |
| 蜂窝孔对边 | 12 mm | 8–18 mm |
| 蜂窝筋宽 | 2.4 mm | 2–4 mm |
| 蜂窝边框宽度 | 10 mm | 6–22 mm，下限随壁厚调整 |
| 滑轨伸出宽度 | 每侧 8 mm | 2–20 mm，上限随柜体调整 |
| 滑轨截面高度 | 3 mm | 1–7 mm，上限随柜体调整 |

顶板厚度比柜体壁厚多 1 mm，默认 5 mm。调整柜高时，两个抽屉的面板、托盘和上层滑轨随之调整。拉手缺口约占抽屉面板宽度的 26.7%，默认 64 mm。放不下完整蜂窝孔的区域会保留实心。

默认抽屉尺寸为 240 × 229 × 84 mm，左右各留 1 mm，后方留 2 mm。两只抽屉都可完全取出，默认行程上限为 229 mm。上层抽屉拉出 224 mm 时脱离滑轨。行程随柜深和背板厚度更新。外壳和抽屉可分别预览 30 种拓竹 PLA Basic 纯色，默认玉石白外壳、灰色抽屉。[拓竹官方色卡](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf)

## 导出并导入 Bambu Studio

1. 调整模型参数后，点击「导出当前尺寸 STL」。首次导出需下载约 11 MB 的 OpenSCAD WebAssembly 引擎，随后由浏览器生成模型并打包。托管页面可直接使用，无需安装 OpenSCAD 或运行导出服务器。
2. 解压 ZIP，将 `cabinet-shell.stl` 导入 Bambu Studio 打印 1 件，将 `cabinet-drawer.stl` 导入后复制成 2 件。配色、开合和观察角度仅用于网页预览。
3. 外壳已按背板朝下摆放。默认打印外形为 250 × 180 × 235 mm，在 256 mm 宽的平台上居中时左右各余 3 mm。切片时检查实际可用区域、裙边和悬空位置。

导出会检查模型尺寸、落板位置及网格闭合与连通性。已在 Chrome 验证默认预览和自定义尺寸下载，并核对实心顶板几何。实心顶板版的实际切片、打印和承载仍待验证。

## 文件与本地预览

| 文件 | 用途 |
| --- | --- |
| [`cabinet.scad`](cabinet.scad) | 外壳与抽屉的参数化源模型 |
| [`previews/defaults.glb`](previews/defaults.glb) | 默认网页预览，包含实心顶板外壳与抽屉，Meshopt 压缩后约 167 KB |
| [`stl/shell.stl`](stl/shell.stl) | 默认尺寸的实心顶板外壳 |
| [`stl/drawer.stl`](stl/drawer.stl) | 默认尺寸的通用抽屉 |
| `viewer/` | 网页、预览和浏览器导出代码 |

从项目根目录启动静态服务。

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

然后打开[本地预览](http://127.0.0.1:8766/viewer/)。部署到 GitHub Pages 等静态托管时，请同时发布网页、`cabinet.scad`、`previews/defaults.glb` 和 `viewer/vendor/`。

第三方许可证见 [Three.js MIT](viewer/vendor/LICENSE) 和 [OpenSCAD COPYING](viewer/vendor/openscad/COPYING)。
