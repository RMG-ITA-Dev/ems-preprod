import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddInstallmentNote,
  useEditInstallmentNote,
  useDeleteInstallmentNote,
} from "@/hooks/mutations";
import type { InstallmentNote } from "@/hooks/useInstallmentNotes";

interface InstallmentNotesThreadProps {
  woId: string;
  /** null = el hilo del plan entero, no el de una cuota (decisión Q33). */
  installmentId: string | null;
  notes: InstallmentNote[];
  /** staff_id de quien está mirando: decide qué notas puede editar o borrar (decisión Q51). */
  currentStaffId?: string | null;
  canWrite: boolean;
  isAdmin?: boolean;
}

/**
 * Cobranzas Fase 4 (issue #352) — hilo de notas entre el encargo y Contabilidad.
 *
 * Las notas se MUESTRAN, no se marcan como leídas (decisión del operador Q34): el operador
 * pidió que fueran notorias, no que agregaran un paso más. Por eso no hay acuse de lectura ni
 * estado "pendiente": hay un contador en la fila, un banner arriba del plan y un bloque
 * destacado dentro de los diálogos de facturar y de cobrar, que es cuando pesan.
 */
export function InstallmentNotesThread({
  woId,
  installmentId,
  notes,
  currentStaffId,
  canWrite,
  isAdmin = false,
}: InstallmentNotesThreadProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const addNote = useAddInstallmentNote();
  const editNote = useEditInstallmentNote();
  const deleteNote = useDeleteInstallmentNote();

  const authorName = (n: InstallmentNote) =>
    [n.author?.first_name, n.author?.last_name].filter(Boolean).join(" ") || "—";

  // Editar y borrar son del autor, o de un admin: una nota es de quien la escribió, ni
  // siquiera la otra parte del hilo la toca. El servidor lo verifica igual.
  const canModify = (n: InstallmentNote) =>
    isAdmin || (!!currentStaffId && n.author_staff_id === currentStaffId);

  return (
    <div className="space-y-3">
      {notes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("workOrders.paymentPlan.notesEmpty")}</p>
      )}

      {notes.map((n) => (
        <div key={n.note_id} className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{authorName(n)}</span>{" "}
              <span className="font-mono">{new Date(n.created_at).toLocaleDateString("es-BO")}</span>
              {n.updated_at !== n.created_at && (
                <span className="ml-1 italic">({t("workOrders.paymentPlan.notesEdited")})</span>
              )}
            </div>
            {canModify(n) && editingId !== n.note_id && (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  aria-label={t("workOrders.paymentPlan.notesEdit")}
                  onClick={() => {
                    setEditingId(n.note_id);
                    setEditDraft(n.body);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-destructive"
                  aria-label={t("workOrders.paymentPlan.notesDelete")}
                  onClick={() => deleteNote.mutate({ noteId: n.note_id, woId })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {editingId === n.note_id ? (
            <div className="mt-2 space-y-2">
              <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="cancel" onClick={() => setEditingId(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!editDraft.trim()}
                  onClick={() => {
                    editNote.mutate({ noteId: n.note_id, body: editDraft, woId });
                    setEditingId(null);
                  }}
                >
                  {t("workOrders.paymentPlan.notesSave")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
          )}
        </div>
      ))}

      {canWrite && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("workOrders.paymentPlan.notesPlaceholder")}
            rows={2}
            aria-label={t("workOrders.paymentPlan.notesAdd")}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                addNote.mutate({ woId, installmentId, body: draft });
                setDraft("");
              }}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              {t("workOrders.paymentPlan.notesAdd")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
