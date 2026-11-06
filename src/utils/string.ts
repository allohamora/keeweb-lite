export const kebabCaseToTitle = (value: string) =>
  value
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const encoder = new TextEncoder();

const ELLIPSIS = '...';

export const truncateBytes = (value: string, maxBytes: number) => {
  if (encoder.encode(value).length <= maxBytes) {
    return value;
  }

  const limit = maxBytes - ELLIPSIS.length;
  let result = '';
  let bytes = 0;

  for (const char of value) {
    bytes += encoder.encode(char).length;

    if (bytes > limit) {
      break;
    }

    result += char;
  }

  return `${result}${ELLIPSIS}`;
};
