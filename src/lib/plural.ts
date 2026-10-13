// "1 page", "3 pages". The plural is the word plus "s" unless given.
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
