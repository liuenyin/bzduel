export function payloadObject(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

export function normalizeNickname(value) {
  if (typeof value !== 'string') return null;
  const nickname = value.trim();
  if (!nickname || Array.from(nickname).length > 12) return null;
  return nickname;
}

export function validRoomId(value) {
  return typeof value === 'string' && /^\d{1,8}$/.test(value);
}

export function rejectInvalidNickname(socket) {
  socket.emit('error_msg', { message: '昵称不能为空且不能超过12个字符' });
}

