export function average(data) {
  if (data.length === 0) return 0;

  let sum = data.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0
  );
  return sum / data.length;
}
