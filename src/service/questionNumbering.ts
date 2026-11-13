export function nextQuestionNumber (questionUris: string[]): number {
  const questionNumbers = questionUris
    .map((uri) => uri.match(/\/q(\d+)\.ttl$/)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .filter(Number.isSafeInteger)

  return (questionNumbers.length > 0 ? Math.max(...questionNumbers) : 0) + 1
}
