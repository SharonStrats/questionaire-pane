export function shuffle<T> (values: T[]): T[] {
  const result = values.slice()

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const value = result[index]
    result[index] = result[randomIndex]
    result[randomIndex] = value
  }

  return result
}

export function shuffleDifferent<T> (values: T[]): T[] {
  const result = shuffle(values)
  if (result.length > 1 && result.every((value, index) => value === values[index])) {
    ;[result[0], result[1]] = [result[1], result[0]]
  }
  return result
}
