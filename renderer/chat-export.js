import { getMessages } from './chat.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeMessageForExport(m) {
  const row = {
    id: m.id || null,
    timestamp: m.timestamp || null,
    outgoing: !!m.outgoing,
    text: m.text || '',
  };
  if (m.editedAt) row.editedAt = m.editedAt;
  if (m.replyTo) {
    row.replyTo = {
      id: m.replyTo.id || null,
      from: m.replyTo.from ?? null,
      text: m.replyTo.text || '',
      preview: m.replyTo.preview || '',
    };
  }
  if (m.attachment) {
    row.attachment = {
      kind: m.attachment.kind || 'file',
      name: m.attachment.name || null,
      size: m.attachment.size ?? null,
    };
  }
  if (m.reactions && Object.keys(m.reactions).length) {
    row.reactions = m.reactions;
  }
  return row;
}

export function buildChatExportPayload(peerId, displayName) {
  const msgs = getMessages(peerId);
  return {
    schema: 'blip_chat_export_v1',
    exportedAt: new Date().toISOString(),
    peerId,
    displayName: displayName || `BLIP-${peerId}`,
    messageCount: msgs.length,
    messages: msgs.map(sanitizeMessageForExport),
  };
}

export function exportPeerChatJson(peerId, displayName) {
  const json = `${JSON.stringify(buildChatExportPayload(peerId, displayName), null, 2)}\n`;
  downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), `blip-${peerId}-chat.json`);
}

function formatLineForPdf(m, label) {
  const who = m.outgoing ? 'You' : label;
  const time = new Date(m.timestamp || Date.now()).toLocaleString();
  let body = m.text || '';
  if (m.attachment?.kind === 'image') body = `[IMG] ${body}`.trim();
  else if (m.attachment?.kind === 'file') body = `[FILE] ${m.attachment.name || ''} ${body}`.trim();
  if (m.editedAt) body += ' (edited)';
  return `[${time}] ${who}: ${body}`;
}

export async function exportPeerChatPdf(peerId, displayName) {
  const { jsPDF } = await import('jspdf');
  const msgs = getMessages(peerId);
  const label = displayName || `BLIP-${peerId}`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;
  const lineH = 14;

  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.text(`BLIP chat export — ${label} (#${peerId})`, margin, y);
  y += lineH * 2;
  doc.setFontSize(9);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
  y += lineH * 2;

  const lines = msgs.length
    ? msgs.map((m) => formatLineForPdf(m, label))
    : ['(no messages)'];

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxW);
    for (const wl of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wl, margin, y);
      y += lineH;
    }
  }

  doc.save(`blip-${peerId}-chat.pdf`);
}
