export type DomainSet = number & { readonly __brand: "DomainSet" };

export function domainSetOf(...ids: readonly number[]): DomainSet {
  let mask = 0;
  for (const id of ids) {
    if (id < 1 || id > 16) {
      throw new Error(`domain id out of range: ${id}`);
    }
    mask |= 1 << (id - 1);
  }
  return mask as DomainSet;
}

export function domainsOverlap(a: DomainSet, b: DomainSet): boolean {
  return (a & b) !== 0;
}
