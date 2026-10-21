import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { onebotRequest } from './onebot-request.js';
import { normalizeStickerEntry } from './sticker-lib.js';

async function isNapCat(config) {
  const version = await onebotRequest(config, 'get_version_info');
  return /napcat/i.test(String(version?.app_name || ''));
}

function checkNativeResult(action, result) {
  if (result?.result !== undefined && Number(result.result) !== 0) {
    throw new Error(`${action} 被 QQ 拒绝: ${result.result} ${String(result.errMsg || '').slice(0, 200)}`);
  }
}

async function listFavorites(config) {
  const entries = await onebotRequest(config, 'fetch_custom_face_detail', { count: 500 });
  if (!Array.isArray(entries)) throw new Error('收藏表情列表格式错误');
  return entries.map(normalizeStickerEntry).filter(Boolean);
}

export async function addFavoriteImage(config, image, assertAllowed) {
  if (!await isNapCat(config)) {
    assertAllowed();
    const result = await onebotRequest(config, 'add_custom_face', { file: `base64://${image.buffer.toString('base64')}` }, 60000);
    if (!result?.emoji_id) throw new Error('add_custom_face 未返回 emoji_id');
    return { id: String(result.emoji_id) };
  }
  // QQ 以 MD5 标识收藏文件，用它回读确认结果，并避免重复收藏。
  const md5 = createHash('md5').update(image.buffer).digest('hex').toUpperCase();
  const existing = (await listFavorites(config)).find(entry => entry.md5 === md5);
  if (existing) return existing;
  const streamId = randomUUID();
  const extension = { 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mimeType];
  if (!extension) throw new Error('不支持收藏该图片格式');
  const chunkSize = 256 * 1024;
  const total = Math.ceil(image.buffer.length / chunkSize);
  for (let index = 0; index < total; index++) {
    assertAllowed();
    const uploaded = await onebotRequest(config, 'upload_file_stream', {
      stream_id: streamId, chunk_index: index, total_chunks: total,
      file_size: image.buffer.length, filename: `qq-bridge-${streamId}.${extension}`,
      file_retention: 300000,
      chunk_data: image.buffer.subarray(index * chunkSize, (index + 1) * chunkSize).toString('base64'),
    });
    if (uploaded?.status !== 'chunk_received' || uploaded.received_chunks !== index + 1) {
      throw new Error('NapCat 未确认图片分块上传');
    }
  }
  assertAllowed();
  const uploaded = await onebotRequest(config, 'upload_file_stream', { stream_id: streamId, is_complete: true });
  if (uploaded?.status !== 'file_complete' || !uploaded.file_path || uploaded.file_size !== image.buffer.length) {
    throw new Error('NapCat 未确认完整图片上传');
  }
  assertAllowed();
  const result = await onebotRequest(config, 'add_custom_face', { file: uploaded.file_path, md5 }, 60000);
  checkNativeResult('add_custom_face', result);
  // 写请求只执行一次；QQ 收藏列表可能稍后才可见。
  for (let attempt = 0; attempt < 20; attempt++) {
    const entry = (await listFavorites(config)).find(item => item.md5 === md5);
    if (entry) return entry;
    await sleep(500);
  }
  throw new Error('已提交收藏，但 QQ 列表尚未确认；请先刷新收藏列表，勿重复提交');
}

export async function setFavoriteRemark(config, entry, remark, assertAllowed) {
  const napcat = await isNapCat(config);
  const action = napcat ? 'set_custom_face_desc' : 'modify_custom_face';
  if (napcat && (!entry.resId || !entry.md5)) throw new Error('表情缺少 NapCat 备注所需的资源信息，请刷新表情库');
  const emojiId = napcat ? entry.emojiId : entry.id;
  if (napcat && !/^\d+$/.test(String(emojiId))) throw new Error('表情缺少 NapCat 原生 emoId，请刷新表情库');
  assertAllowed();
  const result = await onebotRequest(config, action, {
    emoji_id: emojiId, desc: remark,
    ...(napcat ? { res_id: entry.resId, md5: entry.md5 } : {}),
  });
  checkNativeResult(action, result);
  for (let attempt = 0; attempt < 10; attempt++) {
    const confirmed = (await listFavorites(config)).find(item => item.id === entry.id);
    if (confirmed?.desc === remark) return confirmed;
    await sleep(500);
  }
  throw new Error('备注请求已提交，但 QQ 收藏列表尚未确认备注');
}
