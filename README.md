# OpenPrintText

**把定制文字转成 SVG 矢量路径，并在 A4 页面上重复排版。**

OpenPrintText 面向需要制作文字印刷稿的小型工作室。你可以在本机选择字体、输入文字、设置毫米尺寸，再导出独立图案或 A4 排版 SVG。字体和客户文字由浏览器在本机处理。

**当前版本：v0.1.0，早期原型。** 项目由 AI 辅助创建，需要维护者审核及真实生产验证。尚未完成 CorelDRAW 2019 导入测试、实物尺寸核对或菲林试印。请先用不含真实订单信息的小样验证，再判断是否适合自己的流程。

## 可以做什么

- 输入文字，使用内置 DejaVu Sans 字体，或从本机导入 TTF／OTF 字体。
- 将字体中的字形转换成真实 SVG `path`，导出的图案不依赖接收电脑安装同一字体。
- 按指定的毫米区域居中、等比例适配文字图案。
- 在 A4 页面上重复排列图案，并按需要镜像。
- 导出 SVG，供后续检查、排版或导入矢量软件。

这是一个文字图案准备工具，不是完整的 CAD、CorelDRAW 或印前检查系统。它不会自动判断工厂的网版、油墨、网目数、最小线宽或实际可印区域。

## 第一次使用：Windows

1. 下载单文件试用版 `OpenPrintText-v0.1.0.html`，或下载并完整解压项目包。
2. 用 Edge 或 Chrome 打开单文件版，或源码包中的 `dist/index.html`。请打开网页文件，不要在压缩包预览器中操作。
3. 先输入一段简单文字，例如 `CUSTOM TEXT 2027`，查看默认字体效果。
4. 要做中文图案，选择自己本机上有相应字形且允许用于该用途的 TTF／OTF 字体。内置 DejaVu Sans 不覆盖常用中文字形。
5. 填入实际需要的宽、高和排版参数，检查预览，再导出 SVG。
6. 用矢量软件打开导出的文件，检查文字内容、毫米尺寸、边界及镜像方向。先打印一张测试页，并用尺核对尺寸。

如果浏览器对直接打开本地文件有限制，可使用静态服务器。电脑已安装 Python 时，在项目目录打开终端运行：

```bash
python -m http.server 8000 --directory dist
```

然后在同一台电脑打开 `http://localhost:8000`。此命令只提供静态文件，不增加账户、数据库或文字处理后台。用完后在终端按 `Ctrl+C` 停止。

## 在 Android 上体验

1. 完整解压文件，找到 `dist/index.html`。
2. 尝试用支持完整网页功能的浏览器打开。部分文件管理器只提供 HTML 预览，可能无法运行按钮或选择字体。
3. 先用内置字体输入一行英文做小样，再尝试通过文件选择器导入本机字体。
4. 导出后确认文件确实保存为 `.svg`，并把文件传到生产电脑检查。

如果手机无法直接打开本地 HTML，可在电脑启动上述静态服务器，再通过同一局域网访问电脑的地址，例如 `http://电脑的局域网IP:8000`。是否可访问取决于网络和电脑防火墙设置。手机字体选择、文件下载和打印行为仍需在具体机型上验证。

## 字体与文字边界

- **字形覆盖取决于所选字体。** 缺字会明确报错并停止导出，不会静默替换为方框。请更换含有所需字符的字体，并检查最终 SVG。
- v0.1.0 以普通横排文字为主要目标，不承诺阿拉伯文、印度文字、复杂连字、竖排、表情彩色字体或其他复杂文字排版的正确性。
- 优先使用普通 TTF／OTF 文件。TTC 字体集合、可变字体和其他特殊字体格式不属于本版本的已验证范围。
- 导入的字体只用于当前浏览器处理；请自行确认其使用和分发许可。不要把未经允许的商业字体提交到项目仓库或错误报告中。
- 文字转路径会失去可直接编辑的文本属性。请保留原始文字和所用字体信息，方便后续修改。

## 尺寸、镜像和打印

SVG 中的毫米尺寸是设计尺寸。软件导入设置、页面单位及打印机驱动仍可能改变实际输出比例。

在进入生产前，请逐项确认：

1. 导入软件后测得的图案宽高符合预期。
2. A4 页面尺寸为 210 × 297 mm，图案没有越出可打印区域。
3. 打印时使用实际大小／100%，并检查是否启用了自动适应纸张。
4. 镜像方向符合自己的制版和印刷工艺；不要仅凭屏幕上“看起来反了”判断是否正确。
5. 小字、细线、孔隙和边缘在实际试印中可用。

**CorelDRAW 2019 导入与菲林试印目前均待验证。** 软件能够显示 SVG，不代表尺寸和生产结果已经得到验证。完整验证项目见 [测试清单](docs/TEST_CHECKLIST.md)。

## 数据如何处理

本工具没有业务后台、账户系统、AI API 调用或应用内分析埋点。文字和字体处理在本机浏览器中完成；已打包的 `dist/index.html` 可用于离线操作。

如果通过他人提供的网站打开工具，网页服务器本身仍可能产生普通访问日志。下载文件、浏览器扩展和后续导入的软件也有各自的数据行为；这些不属于 OpenPrintText 的文字处理流程。

## 反馈与参与

欢迎报告可复现的问题。请提供浏览器、操作系统、输入样例、排版参数及实际结果；使用测试文字替代客户订单信息。如何贡献和处理字体样例，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

代码使用 [MIT 许可证](LICENSE)。第三方代码和随包字体分别保留其适用的许可，见发行包中的第三方许可说明。

## 开发与验证

运行时依赖已随 `dist/` 打包，日常使用不需要安装 Node、Python 或 npm 包。开发测试可使用 Node.js 18+：

```bash
npm test
npm run check
```

用 Python 3 生成含完整许可信息的离线单文件版：

```bash
python scripts/build-standalone.py
```

输出为 `release/OpenPrintText-v0.1.0.html`。第三方依赖与字体版本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## English overview

OpenPrintText is an early-stage browser tool for converting user text into SVG paths with local TTF/OTF fonts, fitting artwork into a millimetre-sized area, and arranging repeated designs on A4 pages. It has no application backend, account system, AI API calls or analytics. Text and font processing run locally.

Version 0.1.0 was created with AI assistance and needs maintainer review. The bundled DejaVu Sans font supports Latin text; users need a suitable local font for Chinese. Complex-script shaping is not guaranteed. CorelDRAW 2019 compatibility, physical dimensions and production printing have not yet been validated. Export a small sample and check it in the actual production workflow before relying on it.
