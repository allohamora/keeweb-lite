export const randomInt = (from: number, to: number) => {
  const min = Math.ceil(Math.min(from, to));
  const max = Math.floor(Math.max(from, to));

  if (min > max) {
    throw new RangeError('from and to must define at least one integer');
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
};
