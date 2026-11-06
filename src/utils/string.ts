export const kebabCaseToTitle = (value: string) =>
  value
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

export const truncate = (value: string, maxLength: number) => {
  const chars = Array.from(value);

  return chars.length > maxLength ? `${chars.slice(0, maxLength - 3).join('')}...` : value;
};
