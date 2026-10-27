export type Farm = { id: string; owner_id: string; name: string; location: string; created_at: string };
export type Calf = {
  id: string;
  farm_id: string;
  tag: string;
  sex: "Hembra" | "Macho";
  birth_date: string;
  birth_weight: number | null;
  location: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type CalfInput = Pick<Calf, "tag" | "sex" | "birth_date" | "birth_weight" | "location" | "notes">;
