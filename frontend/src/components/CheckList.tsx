import { Checkbox } from "@/components/ui/checkbox";
import type { Category } from "@/services";

export function CheckList({ items, value, onChange }: { items: Category[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.filter((c) => c.active || value.includes(c.id)).map((c) => (
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
