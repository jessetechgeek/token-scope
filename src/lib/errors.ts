export function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 })
}
