import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  title: string;
  description: string;
  label?: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<unknown>;
}

export function ReasonDialog({ open, title, description, label = "Motivo", confirmLabel, destructive, onClose, onSubmit }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">{label}</Label>
          <Textarea id="reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Volver</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!text.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(text);
                setText("");
                onClose();
              } catch {
                /* error toast already shown */
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
