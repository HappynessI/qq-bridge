import sharp from 'sharp';

// DSH 的 GIF 解码可能溢出；只给模型静态采样，收藏和发送继续使用原文件。
export async function modelImageContent({ data, mimeType }) {
  if (!['image/gif', 'image/webp'].includes(mimeType)) {
    return [{ type: 'image', mimeType, data }];
  }
  const buffer = Buffer.from(data, 'base64');
  const options = { limitInputPixels: 64 * 1024 * 1024 };
  const metadata = await sharp(buffer, options).metadata();
  const pages = metadata.pages || 1;
  const selected = [...new Set([0, Math.floor((pages - 1) / 2), pages - 1])];
  const content = [];
  if (pages > 1) {
    content.push({ type: 'text', text: `动图静态预览：共 ${pages} 帧，按时间顺序展示第 ${selected.map(page => page + 1).join('、')} 帧。原动图保留用于收藏和发送；预览不能表示全部动作。` });
  }
  for (const page of selected) {
    const png = await sharp(buffer, { ...options, page, pages: 1 })
      .rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png().toBuffer();
    content.push({ type: 'image', mimeType: 'image/png', data: png.toString('base64') });
  }
  return content;
}
