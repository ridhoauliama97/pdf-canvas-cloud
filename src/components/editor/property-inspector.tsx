import { Lock, Unlock, Trash2, Copy, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CanvasElement, Condition } from "@/types/template";
import { newId } from "@/lib/starter-templates";

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
] as const;

const CONDITION_OPS = [
  { value: "truthy", label: "Is truthy" },
  { value: "falsy", label: "Is falsy" },
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
] as const;

interface PropertyInspectorProps {
  selected: CanvasElement;
  onUpdate: (patch: Partial<CanvasElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

/**
 * Right-sidebar property inspector for the currently selected element.
 *
 * Renders element-specific controls (text, field, table, image, etc.)
 * plus shared controls: name, lock, font family, and conditional visibility.
 */
export function PropertyInspector({
  selected,
  onUpdate,
  onDelete,
  onDuplicate,
}: PropertyInspectorProps) {
  const updateStyle = (patch: Partial<CanvasElement["style"]>) => {
    onUpdate({ style: { ...selected.style, ...patch } });
  };

  const condition = selected.visibleIf;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selected.type}</Badge>
          {selected.locked && (
            <Badge variant="outline" className="text-muted-foreground">
              <Lock className="mr-1 size-3" />
              Locked
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <Copy className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Element name */}
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={selected.name ?? ""}
          onChange={(event) => onUpdate({ name: event.target.value })}
          placeholder={selected.type}
        />
      </div>

      {/* Lock toggle */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onUpdate({ locked: !selected.locked })}
      >
        {selected.locked ? (
          <>
            <Unlock className="mr-2 size-4" /> Unlock element
          </>
        ) : (
          <>
            <Lock className="mr-2 size-4" /> Lock element
          </>
        )}
      </Button>

      {/* Font family */}
      <div className="space-y-1.5">
        <Label>Font family</Label>
        <Select
          value={selected.style.fontFamily}
          onValueChange={(value) => updateStyle({ fontFamily: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Conditional visibility */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <EyeOff className="size-3.5" />
            Conditional visibility
          </Label>
          {condition && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onUpdate({ visibleIf: null as unknown as Condition })}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Data path</Label>
          <Input
            value={condition?.path ?? ""}
            onChange={(event) =>
              onUpdate({
                visibleIf: {
                  path: event.target.value,
                  op: condition?.op ?? "truthy",
                  value: condition?.value ?? "",
                },
              })
            }
            placeholder="invoice.discount"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Operator</Label>
            <Select
              value={condition?.op ?? "truthy"}
              onValueChange={(value) =>
                onUpdate({
                  visibleIf: {
                    path: condition?.path ?? "",
                    op: value as Condition["op"],
                    value: condition?.value ?? "",
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input
              value={condition?.value ?? ""}
              onChange={(event) =>
                onUpdate({
                  visibleIf: {
                    path: condition?.path ?? "",
                    op: condition?.op ?? "truthy",
                    value: event.target.value,
                  },
                })
              }
              placeholder="0"
              disabled={condition?.op === "truthy" || condition?.op === "falsy"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
