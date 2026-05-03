---
name: qr-code-generator
description: 高度可定制二维码生成技能，支持 PNG/SVG 输出、尺寸/边距/颜色/纠错等级/Logo/圆角/标签文字等配置，适用于链接分享、活动物料、产品包装、名片和网页入口。
---

# QR Code Generator Skill

## 能力概览

将文本、URL、联系方式、Wi-Fi 配置等内容生成二维码文件，支持：

- 输出格式：PNG / SVG
- 尺寸：`size` 控制像素尺寸
- 边距：`border` 控制 quiet zone
- 颜色：前景色、背景色、透明背景
- 纠错等级：L / M / Q / H
- Logo：居中嵌入图片并自动留白
- 圆角模块：PNG 下支持模块圆角风格
- 标签文字：在二维码下方追加说明文字
- 输出路径：支持用户 workspace 相对路径

## 适用场景

- 活动报名/签到二维码
- 产品官网/落地页二维码
- 小程序/下载页入口
- Wi-Fi 连接二维码
- 名片 vCard / 联系方式二维码
- 海报、PPT、包装物料中的二维码资产

## 输入建议

用户可以直接说明：

- 二维码内容：URL 或文本
- 输出路径：如 `output/qr.png`
- 尺寸：如 `1024`
- 颜色：如黑白、品牌色、透明背景
- 是否加 logo
- 是否要 SVG 矢量格式
- 是否需要标签文字

## 示例提问

```text
请用 qr-code-generator 生成一个二维码。
内容：https://example.com/campaign
输出：output/campaign-qr.png
尺寸：1024
前景色：#111827
背景色：#ffffff
纠错等级：H
标签文字：扫码了解活动详情
```

```text
请生成一个透明背景 SVG 二维码。
内容：https://my-product.com
输出：output/product-qr.svg
前景色：#0f172a
背景透明：true
边距：2
```

```text
请生成带 Logo 的品牌二维码。
内容：https://example.com/app
输出：output/app-qr.png
尺寸：1200
前景色：#2563eb
背景色：#ffffff
纠错等级：H
Logo：assets/logo.png
Logo 占比：0.22
圆角：8
```

## 执行参数

本 skill 是可执行 bundle（Node 版）。常用参数：

- `--data`：二维码承载内容，必填
- `--output`：输出文件路径，默认 `qr-code.png`
- `--format`：`png` 或 `svg`
- `--size`：图片尺寸，默认 `1024`
- `--border`：边距模块数，默认 `4`
- `--error-correction`：`L/M/Q/H`，默认 `H`
- `--foreground`：前景色，默认 `#000000`
- `--background`：背景色，默认 `#ffffff`
- `--transparent`：透明背景，仅 PNG/SVG 均支持
- `--logo`：Logo 图片路径，可选
- `--logo-scale`：Logo 占二维码宽度比例，默认 `0.2`
- `--module-radius`：PNG 模块圆角半径，默认 `0`
- `--label`：二维码底部标签文字，可选
- `--label-font-size`：标签字号，默认 `42`

## 质量建议

- 带 Logo 时建议纠错等级使用 `H`
- 印刷物料建议输出 `SVG` 或 `size >= 1200` 的 PNG
- 透明背景用于叠加设计稿时，注意二维码前景色和底色对比度
- Logo 占比建议 `0.16 - 0.24`，过大会影响识别
- 二维码内容越长，模块越密，建议增大尺寸和边距
