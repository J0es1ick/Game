export interface IEquipment<TStats = Record<string, number>> {
  id?: string;
  name: string;
  slot?: string;
  stats?: TStats;
}

export interface IArmor<TStats = Record<string, number>> extends IEquipment<TStats> {
  defense?: number;
}
