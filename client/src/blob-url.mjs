export function blobUrl(key) {
  return '/api/files/' + key.split('/').map(encodeURIComponent).join('/');
}
