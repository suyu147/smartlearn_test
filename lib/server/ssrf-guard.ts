export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = [
      'localhost',
      '127.0.0.1',
      'spark-api-open.xf-yun.com',
      'api.openai.com',
      'api.deepseek.com',
      'api.moonshot.cn',
    ];
    return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

export function validateUrlForSSRF(url: string): string | null {
  try {
    const parsed = new URL(url);
    const blockedProtocols = ['file:', 'data:'];
    if (blockedProtocols.includes(parsed.protocol)) {
      return `Protocol "${parsed.protocol}" is not allowed`;
    }
    const hostname = parsed.hostname;
    const privatePatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[0-1])\./,
      /^192\.168\./,
      /^0\./,
      /^localhost$/i,
      /^::1$/,
      /^fd/,
      /^fe80:/,
    ];
    for (const pattern of privatePatterns) {
      if (pattern.test(hostname)) {
        return 'Private network URLs are not allowed';
      }
    }
    return null;
  } catch {
    return 'Invalid URL';
  }
}
