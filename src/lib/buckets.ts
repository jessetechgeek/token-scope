export function floorTime(value: Date, bucketSeconds: number): Date {
  const size = bucketSeconds * 1000
  return new Date(Math.floor(value.getTime() / size) * size)
}

export function ceilTime(value: Date, bucketSeconds: number): Date {
  const floor = floorTime(value, bucketSeconds)
  return floor.getTime() === value.getTime() ? value : new Date(floor.getTime() + bucketSeconds * 1000)
}
