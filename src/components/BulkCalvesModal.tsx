import type { Farm } from "../lib/types";
import { BulkImport } from "./BulkImport";
import { Modal } from "./ui";

export function BulkCalvesModal({ farm, onClose, onSaved }: { farm: Farm; onClose: () => void; onSaved: () => Promise<void> }) {
  return <Modal title="Carga masiva de terneros" onClose={onClose}>
    <BulkImport farm={farm} fixed="terneros" onDone={onSaved} />
  </Modal>;
}
