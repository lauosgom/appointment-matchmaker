import { Checkbox } from "@/components/ui/checkbox";
import type { Category } from "@/services";

export function CheckList({ items, value, onChange }: { items: Category[]; value: string[]; onChange: (v: string[]) => void }) {
  const visible = items.filter((c) => c.active || value.includes(c.id));
  if (visible.length === 0)
    return <p className="text-sm text-muted-foreground">No hay opciones activas. Créalas en Departamentos y áreas.</p>;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {visible.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.includes(c.id)}
            onCheckedChange={(on) => onChange(on ? [...value, c.id] : value.filter((x) => x !== c.id))}
          />
          {c.name}
        </label>
      ))}
    </div>
  );
}
