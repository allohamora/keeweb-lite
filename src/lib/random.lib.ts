export const randomInt = (from: number, to: number) => {
  const min = Math.ceil(Math.min(from, to));
  const max = Math.floor(Math.max(from, to));

  if (min > max) {
    throw new Error('from and to must define at least one integer');
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const randomElement = <Element>(values: readonly Element[]) => {
  const index = randomInt(0, values.length - 1);
  const value = values[index];

  if (value === undefined) {
    throw new Error('value is not found');
  }

  return value;
};
