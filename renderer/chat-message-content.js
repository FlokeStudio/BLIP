/**
 * Shared chat message body: media bubbles, files, link embeds, quote blocks.
 */
import { t } from './i18n.js';
import { appendLinkifiedText } from './linkify.js';
import { formatFileSize } from './file-transfer.js';
import { formatTransferSpeed } from './file-transfer-speed.js';
import { isImageAttachment, isVideoAttachment, isMediaPlaceholderText } from './chat-attachments.js';
import { appendYoutubeEmbed, findYoutubeInText, parseYoutubeUrl } from './link-embed.js';
import {
  openImageAttachment,
  openVideoAttachment,
  openYoutubeViewer,
} from './media-viewer.js';

function openExternalUrl(url) {
  if (window.blip?.openExternal) void window.blip.openExternal(url);
}

export function appendQuoteBlock(block, replyTo, onQuoteClick) {
  if (!replyTo?.id) return;
  const q = document.createElement('div');
  q.className = 'chat-quote';
  if (onQuoteClick) {
    q.classList.add('chat-quote--link');
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      onQuoteClick(replyTo.id);
    });
  }
  const who = document.createElement('span');
  who.className = 'chat-quote-who';
  who.textContent = replyTo.fromLabel || `#${replyTo.from}` || '';
  const body = document.createElement('span');
  body.className = 'chat-quote-body';
  body.textContent = replyTo.preview || replyTo.text || '';
  q.appendChild(who);
  q.appendChild(body);
  block.appendChild(q);
}

function appendFileCard(block, attachment) {
  const card = document.createElement('div');
  card.className = 'chat-file-card';
  const label = document.createElement('span');
  label.className = 'chat-file-name';
  label.textContent = attachment.name || 'file';
  const meta = document.createElement('span');
  meta.className = 'chat-file-meta';
  const sizeStr = formatFileSize(attachment.size);
  const speedStr =
    attachment.speedBps && attachment.pending
      ? ` · ${formatTransferSpeed(attachment.speedBps)}`
      : '';
  meta.textContent = `${sizeStr}${speedStr}`;
  card.appendChild(label);
  card.appendChild(meta);
  if (attachment.dataUrl) {
    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'btn btn-lang chat-file-dl';
    dl.textContent = t('chat.file_download');
    dl.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = document.createElement('a');
      a.href = attachment.dataUrl;
      a.download = attachment.name || 'download';
      a.click();
    });
    card.appendChild(dl);
  } else if (attachment.pending) {
    const pct = Math.min(100, Math.max(0, Number(attachment.progress) || 0));
    const prog = document.createElement('div');
    prog.className = 'chat-file-progress';
    const track = document.createElement('div');
    track.className = 'chat-file-progress-track';
    const fill = document.createElement('div');
    fill.className = 'chat-file-progress-fill';
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    prog.appendChild(track);
    const pendingLbl = document.createElement('span');
    pendingLbl.className = 'chat-file-pending';
    pendingLbl.textContent = t('chat.file_sending').replace('{pct}', String(pct));
    prog.appendChild(pendingLbl);
    card.appendChild(prog);
  } else if (attachment.cancelled) {
    const cancelledLbl = document.createElement('span');
    cancelledLbl.className = 'chat-file-pending';
    cancelledLbl.textContent = t('chat.file_cancelled');
    card.appendChild(cancelledLbl);
  }
  block.appendChild(card);
}

function appendImageBubble(block, attachment) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-media-bubble chat-media-bubble--image';
  const img = document.createElement('img');
  img.className = 'chat-media-thumb';
  img.src = attachment.dataUrl;
  img.alt = attachment.name || 'image';
  img.loading = 'lazy';
  btn.appendChild(img);
  if (attachment.name) {
    const cap = document.createElement('span');
    cap.className = 'chat-media-caption';
    cap.textContent = attachment.name;
    btn.appendChild(cap);
  }
  btn.addEventListener('click', () => openImageAttachment(attachment));
  block.appendChild(btn);
}

function appendVideoBubble(block, attachment) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-media-bubble chat-media-bubble--video';
  const vid = document.createElement('video');
  vid.className = 'chat-media-thumb';
  vid.src = attachment.dataUrl;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  const play = document.createElement('span');
  play.className = 'chat-media-play';
  play.innerHTML = '<span class="pixel-glyph pixel-glyph--play"></span>';
  btn.appendChild(vid);
  btn.appendChild(play);
  if (attachment.name) {
    const cap = document.createElement('span');
    cap.className = 'chat-media-caption';
    cap.textContent = attachment.name;
    btn.appendChild(cap);
  }
  btn.addEventListener('click', () => openVideoAttachment(attachment));
  block.appendChild(btn);
}

function appendTextWithEmbeds(block, text) {
  const src = String(text || '').trim();
  if (!src) return;
  const yts = findYoutubeInText(src);
  if (!yts.length) {
    const span = document.createElement('span');
    span.className = 'chat-text';
    appendLinkifiedText(span, src, openExternalUrl);
    block.appendChild(span);
    return;
  }

  let last = 0;
  for (const yt of yts) {
    if (yt.index > last) {
      const chunk = src.slice(last, yt.index).trim();
      if (chunk) {
        const span = document.createElement('span');
        span.className = 'chat-text';
        appendLinkifiedText(span, chunk, openExternalUrl);
        block.appendChild(span);
      }
    }
    appendYoutubeEmbed(block, yt, {
      onPlay: () => openYoutubeViewer(yt.id),
    });
    last = yt.index + yt.raw.length;
  }
  if (last < src.length) {
    const tail = src.slice(last).trim();
    if (tail) {
      const span = document.createElement('span');
      span.className = 'chat-text';
      appendLinkifiedText(span, tail, openExternalUrl);
      block.appendChild(span);
    }
  }
}

/**
 * @param {HTMLElement} block
 * @param {{ text?: string, attachment?: object, replyTo?: object }} m
 */
export function appendChatMessageBody(block, m, opts = {}) {
  if (m.replyTo) appendQuoteBlock(block, m.replyTo, opts.onQuoteClick);

  const att = m.attachment;
  if (isImageAttachment(att)) {
    appendImageBubble(block, att);
  } else if (isVideoAttachment(att)) {
    appendVideoBubble(block, att);
  } else if (att?.kind === 'file') {
    appendFileCard(block, att);
  }

  const hideText = isMediaPlaceholderText(m.text, att);
  if (m.text && !(att?.pending && !m.text.trim()) && !hideText) {
    appendTextWithEmbeds(block, m.text);
  } else if (!att && m.text) {
    appendTextWithEmbeds(block, m.text);
  }
}

export function buildReplyPreview(m, fromId) {
  if (m.attachment?.kind === 'image') return t('chat.reply_preview_image');
  if (isVideoAttachment(m.attachment)) return t('chat.reply_preview_video');
  if (m.attachment?.kind === 'file') {
    return t('chat.reply_preview_file').replace('{name}', m.attachment.name || 'file');
  }
  const text = String(m.text || '').trim();
  const yt = parseYoutubeUrl(text);
  if (yt) return t('chat.reply_preview_youtube');
  return text.slice(0, 120) || '…';
}

export function formatReplyFromLabel(from, displayName) {
  return displayName || `BLIP-${from}`;
}
